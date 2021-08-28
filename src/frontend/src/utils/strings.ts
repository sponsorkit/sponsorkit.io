export function combineClassNames(...args: (string|false|undefined|null)[]): string {
    return args.filter(x => x).join(' ');
}