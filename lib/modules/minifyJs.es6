import { isEventHandler, optionalRequire } from '../helpers';
import { redundantScriptTypes } from './removeRedundantAttributes';

const terser = optionalRequire('terser');

/** Minify JS with Terser */
export default function minifyJs(tree, options, terserOptions) {
    if (!terser) return tree;

    let promises = [];
    tree.walk(node => {
        if (node.tag && node.tag === 'script') {
            const nodeAttrs = node.attrs || {};
            const mimeType = nodeAttrs.type || 'text/javascript';
            if (redundantScriptTypes.has(mimeType) || mimeType === 'module') {
                promises.push(processScriptNode(node, terserOptions));
            }
        }

        if (node.attrs) {
            promises = promises.concat(processNodeWithOnAttrs(node, terserOptions));
        }

        return node;
    });

    return Promise.all(promises).then(() => tree);
}


function stripCdata(js) {
    const leftStrippedJs = js.replace(/\/\/\s*<!\[CDATA\[/, '').replace(/\/\*\s*<!\[CDATA\[\s*\*\//, '');
    if (leftStrippedJs === js) {
        return js;
    }

    const strippedJs = leftStrippedJs.replace(/\/\/\s*\]\]>/, '').replace(/\/\*\s*\]\]>\s*\*\//, '');
    return leftStrippedJs === strippedJs ? js : strippedJs;
}


function processScriptNode(scriptNode, terserOptions) {
    let js = (scriptNode.content || []).join('').trim();
    if (!js) {
        return scriptNode;
    }

    // Improve performance by avoiding calling stripCdata again and again
    let isCdataWrapped = false;
    if (js.includes('CDATA')) {
        const strippedJs = stripCdata(js);
        isCdataWrapped = js !== strippedJs;
        js = strippedJs;
    }

    return terser
        .minify(js, terserOptions)
        .then(result => {
            if (result.error) {
                throw new Error(result.error);
            }
            if (result.code === undefined) {
                return;
            }

            let content = result.code;
            if (isCdataWrapped) {
                content = '/*<![CDATA[*/' + content + '/*]]>*/';
            }

            scriptNode.content = [content];
        });
}


function processNodeWithOnAttrs(node, terserOptions) {
    const jsWrapperStart = 'function a(){';
    const jsWrapperEnd = '}a();';

    const promises = [];
    for (const attrName of Object.keys(node.attrs || {})) {
        if (!isEventHandler(attrName)) {
            continue;
        }

        // For example onclick="return false" is valid,
        // but "return false;" is invalid (error: 'return' outside of function)
        // Therefore the attribute's code should be wrapped inside function:
        // "function _(){return false;}"
        let wrappedJs = jsWrapperStart + node.attrs[attrName] + jsWrapperEnd;
        let promise = terser
            .minify(wrappedJs, terserOptions)
            .then(({ code }) => {
                let minifiedJs = code.substring(
                    jsWrapperStart.length,
                    code.length - jsWrapperEnd.length
                );
                node.attrs[attrName] = minifiedJs;
            });
        promises.push(promise);
    }

    return promises;
}
