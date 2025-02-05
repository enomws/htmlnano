const rNodeAttrsTypeJson = /(\/|\+)json/;

export function onContent() {
    return (content, node) => {
        if (node.attrs && node.attrs.type && rNodeAttrsTypeJson.test(node.attrs.type)) {
            try {
                // cast minified JSON to an array
                return [JSON.stringify(JSON.parse((content || []).join('')))];
            } catch (error) {
                // Invalid JSON
            }
        }

        return content;
    };
}
