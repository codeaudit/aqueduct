/* tslint:disable:no-console */
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import * as request from 'superagent';
import * as yargs from 'yargs';
import { ISchema } from './swagger';
import * as Swagger from './swagger';

interface ITemplateView {
  services: ITemplateService[];
  models: ITemplateModel[];
  baseUrl: string;
  apiPath: string;
}

interface ITemplateService {
  name: string;
  operations: ITemplateOperation[];
}

interface ITemplateModel {
  name: string;
  properties: Array<{
    propertyName: string;
    propertyType: string;
  }>;
}

interface ITemplateOperation {
  id: string;
  method: string;
  signature: string;
  urlTemplate: string;
  returnType: string;
  paramsInterfaceName?: string;
  parameters?: ITemplateOperationParameters[];
  queryParameters?: string[];
  bodyParameter?: string;
  hasParameters: boolean;
  hasBodyParameter: boolean;
}

interface ITemplateOperationParameters {
  parameterName: string;
  parameterType: string;
}

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0 as any;
const baseApiUrl = yargs.argv.baseApiUrl;
if (!baseApiUrl) {
  throw new Error('No baseApiUrl provided.');
}

const getSwaggerJson = () => {
  return new Promise<Swagger.ISpec>((resolve, _reject) => {
    request
      .get(`${baseApiUrl}/swagger.json`)
      .set('Accept', 'application/json')
      .end((_, res) => {
        resolve(res.body);
      });
  });
};

getSwaggerJson();

const template = handlebars.compile(`/* tslint:disable */
import { ApiService, IRequestParams } from '../api-service';
import { Events as EventNamespace } from '../socket/events';

export namespace Aqueduct {
  let baseUrl: string;
  let apiKey: string | undefined;
  export const Events = EventNamespace;

  export const Initialize = (params: { baseUrl: string, apiKey?: string }) => {
    baseUrl = params.baseUrl;
    apiKey = params.apiKey;
    Events.Initialize(baseUrl);
  };
  {{#models}}

  export interface {{name}} {
    {{#properties}}
    {{propertyName}}: {{propertyType}};
    {{/properties}}
  }
  {{/models}}
  {{#services}}
  {{#operations}}
  {{#if hasParameters}}

  export interface {{paramsInterfaceName}} {
    {{#parameters}}
    {{parameterName}}: {{parameterType}};
    {{/parameters}}
  }
  {{/if}}
  {{/operations}}
  {{/services}}
  {{#services}}
  export class {{name}} extends ApiService {
    {{#operations}}

    public async {{id}}({{signature}}) {
      const requestParams: IRequestParams = {
        method: '{{method}}',
        url: \`\${baseUrl}{{../../apiPath}}{{urlTemplate}}\`
      };
      {{#if queryParameters}}
    
      requestParams.queryParameters = {
      {{#queryParameters}}
        {{this}}: params.{{this}},
      {{/queryParameters}}
      };
      {{/if}}
      {{#if hasBodyParameter}}
    
      requestParams.body = params.{{bodyParameter}};
      {{/if}}
      return this.executeRequest<{{returnType}}>(requestParams);
    };
    {{/operations}}
  }
  {{/services}}
}
`);

const stringifyNumberEnum = (enumValue: Array<any>) => enumValue.map(s => `${s}`).join(' | ');
const getTypeFromRef = ($ref: string) => {
  return `${$ref.replace('#/definitions/', '')}`;
};

const getPropertyTypeFromSwaggerProperty = (property: Swagger.ISchema): string => {
  if (!property) { return 'void'; }

  if (property.type) {
    if (property.type === 'integer' || property.format === 'double') {
      if (property.format === 'int64') { return 'string'; }
      if (property.enum) { return stringifyNumberEnum(property.enum); }

      return 'number';
    }
    if (property.type === 'boolean') { return 'boolean'; }
    if (property.type === 'string') {
      return property.format === 'date-time' ? 'Date' : 'string';
    }

    if (property.type === 'array') {
      const items = property.items as Swagger.ISchema;
      if (!items) { throw new Error(); }

      if (items.type) {
        return `any[]`;
      }

      return `${getTypeFromRef(items.$ref as string)}[]`;
    }
  }

  if (property.$ref) { return getTypeFromRef(property.$ref); }

  return 'any';
};

const getTypeScriptTypeFromSwaggerType = (schema: ISchema) => {
  if (schema.type === 'integer' || schema.type === 'number') {
    if (schema.enum) {
      return stringifyNumberEnum(schema.enum);
    }

    return 'number';
  }

  if (schema.type === 'boolean') { return 'boolean'; }
  if (schema.type === 'string') {
    return schema.format === 'date-time' ? 'Date' : 'string';
  }

  return undefined;
};

const getPropertyTypeFromSwaggerParameter = (parameter: Swagger.IBaseParameter): string => {
  const queryParameter = parameter as Swagger.IQueryParameter;
  if (queryParameter.type) {
    const tsType = getTypeScriptTypeFromSwaggerType(queryParameter as any);
    if (tsType) { return tsType; }
  }

  const bodyParameter = parameter as Swagger.IBodyParameter;
  const schema = bodyParameter.schema;
  if (schema) {
    if (schema.$ref) {
      return getTypeFromRef(schema.$ref);
    }

    if (schema.type === 'array') {
      const items = schema.items as Swagger.ISchema;
      if (items.$ref) { return `${getTypeFromRef(items.$ref as string)}[]`; }
      if (items.type) {
        const tsType = getTypeScriptTypeFromSwaggerType(items);
        if (tsType) { return `${tsType}[]`; }
      }
    }
  }

  return 'any';
};

const getNormalizedDefinitionKey = (key: string) => {
  if (key.includes('[]')) {
    return key;
  }

  return key.replace('[', '').replace(']', '');
};

const getTemplateView = (swagger: Swagger.ISpec): ITemplateView => {
  const definitions = swagger.definitions;
  if (!definitions) { throw new Error('No definitions.'); }

  const paths = swagger.paths;
  if (!paths) { throw new Error('No paths.'); }

  const serviceMap: { [serviceName: string]: ITemplateService } = {};
  Object.keys(paths)
    .forEach(pathKey => {
      const methods = ['get', 'post', 'delete', 'patch', 'put', 'options', 'head'];
      const path = paths[pathKey]

      Object.keys(path)
        .filter(operationKey => methods.find(m => m === operationKey))
        .forEach(operationKey => {
          const operation = (path as any)[operationKey] as Swagger.IOperation;
          if (!operation.operationId || !operation.tags) { throw new Error(); }

          const tag = operation.tags[0];
          const service = serviceMap[tag] = serviceMap[tag] || { name: `${tag}Service`, operations: [] };

          let operationId = operation.operationId.replace('_', '');
          if (tag) {
            operationId = operationId.replace(tag, '');
          }

          const parameters = operation.parameters;
          const operationParameters = new Array<ITemplateOperationParameters>();

          // /api/{someParam}/{anotherParam} => /api/${someParam}/${anotherParam}
          let urlTemplate = `${pathKey}`.replace(/\{/g, '${');
          let signature = '';
          let paramsInterfaceName = '';
          let queryParameters: string[] | undefined = undefined;
          let bodyParameter: string | undefined;
          let hasBodyParameter = false;

          if (parameters && parameters.length) {
            paramsInterfaceName = `I${tag}${operationId.charAt(0).toUpperCase() + operationId.slice(1)}Params`;
            signature = `params: ${paramsInterfaceName}`;
            parameters.forEach(parameter => {
              const parameterName = parameter.name;

              operationParameters.push({
                parameterName: `${parameterName}${parameter.required === false ? '?' : ''}`,
                parameterType: getPropertyTypeFromSwaggerParameter(parameter)
              });

              if (parameter.in === 'path') {
                urlTemplate = urlTemplate.replace(parameter.name, `params.${parameterName}`);
                return;
              }

              if (parameter.in === 'query') {
                queryParameters = queryParameters || new Array<string>();
                queryParameters.push(parameterName);
                return;
              }

              if (parameter.in === 'body') {
                hasBodyParameter = true;
                bodyParameter = parameterName;
              }
            });
          }

          let returnType = 'void';
          if (operation.responses['200']) {
            returnType = getNormalizedDefinitionKey(getPropertyTypeFromSwaggerProperty(operation.responses['200'].schema as Swagger.ISchema));
          }

          service.operations.push({
            id: operationId.charAt(0).toLowerCase() + operationId.slice(1),
            method: operationKey.toUpperCase(),
            signature,
            urlTemplate,
            parameters: operationParameters,
            hasParameters: !!operationParameters.length,
            bodyParameter,
            queryParameters,
            returnType,
            paramsInterfaceName,
            hasBodyParameter
          } as ITemplateOperation);
        })
    });

  return {
    baseUrl: baseApiUrl,
    apiPath: swagger.basePath as string,
    services: Object.keys(serviceMap).map(key => serviceMap[key]),
    models: Object.keys(definitions).map(definitionKey => {
      const definition = definitions[definitionKey];
      if (!definition) { throw new Error('No definition found.'); }

      const properties = definition.properties;
      if (!properties) {
        console.log(definition);
        throw new Error('No definition properties found.');
      }

      return {
        name: `${getNormalizedDefinitionKey(definitionKey)}`,
        properties: Object.keys(properties).map(propertyKey => {
          const property = properties[propertyKey];
          const isRequired = definition.required && definition.required.find(propertyName => propertyName === propertyKey);

          return {
            propertyName: `${propertyKey}${isRequired ? '' : '?'}`,
            propertyType: getPropertyTypeFromSwaggerProperty(property)
          };
        })
      };
    })
  };
};

getSwaggerJson()
  .then((swaggerSpec: Swagger.ISpec) => {
    try {
      const compiled = template(getTemplateView(swaggerSpec));
      fs.writeFileSync(`${__dirname}/src/generated/api.ts`, compiled);
      console.log('Api file generated!');
    } catch (err) {
      console.log(err);
    }
  });
