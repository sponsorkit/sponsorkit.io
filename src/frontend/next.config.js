const path = require("path");

module.exports = {
    webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
        const addAlias = (alias) => {
            config.resolve.alias["@" + alias] = path.resolve(__dirname, "src/ " + alias);
        }

        addAlias("components");
        addAlias("hooks");
        addAlias("utils");
        addAlias("theme");
        addAlias("pages");

        return config
    },
}