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

declare type ArrayContents<TArray> = Exclude<TArray, null | undefined> extends any[] ? 
    (Exclude<TArray, null | undefined>[number]) : 
    never;