export async function delay(milliseconds: number, signal?: AbortSignal) {
    return await new Promise<void>(resolve => 
        setTimeout(
            () => {
                if(signal?.aborted)
                    return;

                resolve();
            }, 
            milliseconds));
}

export async function defer<T>() {
    await delay(0);
}