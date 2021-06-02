import { General } from "./openapi/src/general";

export const apiClient = new General(
    {
        getToken: async () => ({token: "dummy", expiresOnTimestamp: 13371337})
    },
    "");