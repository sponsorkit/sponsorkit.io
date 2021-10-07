import { createApi } from "@hooks/clients";
import { SponsorkitDomainControllersApiAccountResponse } from "@sponsorkit/client";

export default function createAccountValidatior(predicate: (account: SponsorkitDomainControllersApiAccountResponse) => boolean) {
    return (async () => {
        const account = await createApi().accountGet();
        return predicate(account);
    });
}