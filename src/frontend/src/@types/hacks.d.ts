//HACK: solving autorest issue: https://github.com/Azure/autorest.typescript/issues/1230
export interface ThisExpression extends BaseExpression {
    type: "ThisExpression";
}
export interface ImportExpression extends BaseExpression {
    type: "ImportExpression";
}