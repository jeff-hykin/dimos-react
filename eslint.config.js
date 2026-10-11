import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"

export default tseslint.config(
    { ignores: ["dist/", "dist-demo/", "node_modules/", "src/vendor/"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { "react-hooks": reactHooks },
        rules: {
            curly: ["error", "all"],
            "no-undef": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "react-hooks/rules-of-hooks": "error",
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
)
