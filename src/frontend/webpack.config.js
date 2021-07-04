const path = require("path");

module.exports = {
    resolve: {
        alias: {
            "@components": path.resolve(__dirname, "src/components"),
            "@hooks": path.resolve(__dirname, "src/hooks"),
            "@utils": path.resolve(__dirname, "src/utils"),
            "@theme": path.resolve(__dirname, "src/theme/index.tsx")
        }
    },
    module: {
        rules: [
            {
                test: /\.module\.scss$/i,
                use: [
                    "css-loader",
                    "sass-loader",
                ],
            },
        ]
    }
}