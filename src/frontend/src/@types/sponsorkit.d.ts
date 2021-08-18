declare module "*.svg" {
    const content: any;
    export default content;
}

declare module "*.png";

declare module '*.module.scss' {
    interface IClassNames {
        [className: string]: string
    }
    const classNames: IClassNames;
    export = classNames;
}