using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Sponsorkit.Infrastructure
{
    public class AutoRestOpenApiFilter : 
        ISchemaFilter, 
        IDocumentFilter, 
        IOperationFilter, 
        IParameterFilter, 
        IRequestBodyFilter
    {
        public void Apply(OpenApiSchema schema, SchemaFilterContext context) {
            var type = context.Type;
            if (type.IsEnum) {
                schema.Extensions.Add(
                    "x-ms-enum",
                    new OpenApiObject {
                        ["name"] = new OpenApiString(type.Name),
                        ["modelAsString"] = new OpenApiBoolean(false)
                    }
                );
            }

            schema.AdditionalPropertiesAllowed = true;
            schema.AdditionalProperties = null;
        }

        public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
        {
            foreach (var schema in swaggerDoc.Components.Schemas.Values)
            {
                var properties = schema.Properties;
                foreach (var propertyPair in properties)
                {
                    if (propertyPair.Value.Nullable)
                        continue;
                    
                    schema.Required.Add(propertyPair.Key);
                }
            }
        }

        public void Apply(OpenApiOperation operation, OperationFilterContext context)
        {
            
        }

        public void Apply(OpenApiParameter parameter, ParameterFilterContext context)
        {
            
        }

        public void Apply(OpenApiRequestBody requestBody, RequestBodyFilterContext context)
        {
            
        }
    }
}