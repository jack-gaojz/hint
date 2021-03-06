import { debug as d } from './debug';
import { AsyncHTMLAttribute, IAsyncHTMLElement, ProblemLocation } from '../types';

const debug: debug.IDebugger = d(__filename);

const quotesRegex: RegExp = /('|")/g;

const escapeQuotes = (text: string): string => {
    return text.replace(quotesRegex, '\\$1');
};

/**
 * Escape an attribute name with namespace.
 * e.g. xmlns:data
 */
const escapeNamespace = (text: string): string => {
    return text.replace(':', '\\:');
};

/**
 * Escape a newline within a CSS attribute selector.
 * https://stackoverflow.com/questions/20338493/css-attribute-selectors-how-to-escape-newlines-within-attribute-value
 */
const escapeNewline = (text: string): string => {
    return text.replace(/\n(\s)?/g, '\\a $1');
};

/**
 * Creates a CSS selector from a given element using its attributes and the type of node:
 *
 * Ex.: <a href="www.wikipedia.org"></a> --> 'a[href="www.wikipedia.org"]'
 */
const selectorFromElement = (element: IAsyncHTMLElement): string => {
    let selector: string = element.nodeName.toLowerCase();

    const attributes = element.attributes;

    // attributes doesn't have the Symbol.Iterator();
    for (let i = 0; i < attributes.length; i++) {
        const attribute: AsyncHTMLAttribute = attributes[i] || attributes.item && attributes.item(i);

        /*
         * jsdom breaks when attribute names have a `.` (invalid) but it is widely used,
         * so we ignore that selector.
         */
        if (!attribute.name.includes('.')) {
            selector += `[${escapeNamespace(attribute.name)}="${escapeQuotes(escapeNewline(attribute.value))}"]`;
        }
    }

    debug(`Selector created: ${selector}`);

    return selector;
};

/**
 * Finds all the indices of a string into another
 *
 * Original code: http://stackoverflow.com/a/3410557/414145
 */
const getIndicesOf = (searchStr: string, str: string): number[] => {
    const searchStrLen: number = searchStr.length;

    let startIndex: number = 0;
    let index: number;
    const indices: number[] = [];

    // We had a problem getting the outerHTML of the element before
    if (searchStr === '') {
        return indices;
    }

    while ((index = str.indexOf(searchStr, startIndex)) > -1) {
        indices.push(index);
        startIndex = index + searchStrLen;
    }

    debug(`Indices found: ${indices.length} (${JSON.stringify(indices)})`);

    return indices;
};

/** Finds the Location of an HTMLElement in the document */
export const findElementLocation = async (element: IAsyncHTMLElement): Promise<ProblemLocation> => {
    const location = element.getLocation();

    // Use the element information from parsing if we have it.
    /* istanbul ignore next */
    if (location) {
        return location;
    }

    // Otherwise try to infer where the element was located.
    const html: string = await element.ownerDocument.pageHTML();
    const elementHTML: string = await element.outerHTML();
    const indexOccurences: number[] = getIndicesOf(elementHTML, html);
    const selector: string = selectorFromElement(element);
    let elements: IAsyncHTMLElement[];

    try {
        elements = await element.ownerDocument.querySelectorAll(selector);
    } catch (e) {
        // This can happen due to invalid attribute names created by the HTML parser (e.g. "%").
        debug(`Invalid selector, falling back to start of document: '${selector}'.`);

        return {
            column: 0,
            line: 0
        };
    }

    let similarItems: number = 0;

    // We found the exact number of occurrences so we can access the right index
    for (let index = 0; index < elements.length; index++) {
        const currentElement: IAsyncHTMLElement = elements[index];

        /*
         * We compare the HTML because the selector might not be enough to distinguish:
         * <a href="http://site1">Site1</a>
         * <a href="http://site1">Site2</a>
         */
        const currentElementHTML: string = await currentElement.outerHTML();

        if (currentElementHTML === elementHTML) {
            similarItems++;
            if (element.isSame(currentElement)) {
                break;
            }
        }
    }

    const htmlBeforeElement: string = html.substring(0, indexOccurences[similarItems - 1]);

    const lines: string[] = htmlBeforeElement.split('\n');
    const line: number = lines.length;
    const column: number = (lines.pop() || '').replace(/[\t]/g, '    ').length + 1;

    return {
        column,
        line
    };
};

/**
 * Returns the first location (line/column) where `content` appears.
 * * If no content is provided, the return value is {0, 0}
 * * If the content is not found, the return value is {-1, -1}
 */
export const findInElement = async (element: IAsyncHTMLElement, content: string): Promise<ProblemLocation> => {
    if (!content) {
        return {
            column: 0,
            line: 1
        };
    }

    const outerHTML: string = await element.outerHTML();

    const startIndex: number = outerHTML.indexOf(content);

    if (startIndex === -1) {
        return {
            column: -1,
            line: -1
        };
    }

    const html: string = outerHTML.substring(0, startIndex);
    const lines: string[] = html.split('\n');
    const line: number = lines.length;

    // `startIndex + 1` because `indexOf` starts from `0`.
    const column: number = (lines.length === 1 ? startIndex : (lines.pop() || '').replace(/[\t]/g, '    ').length) + 1;

    return {
        column,
        line
    };
};

/** Returns the real location of a problem in the given HTML */
export const findProblemLocation = async (element: IAsyncHTMLElement, offset: ProblemLocation, content?: string): Promise<ProblemLocation> => {
    const elementLocation: ProblemLocation = await findElementLocation(element);
    const problemLocation: ProblemLocation = await findInElement(element, content || '');

    if (problemLocation.line === 1) {
        return {
            column: problemLocation.column + elementLocation.column + offset.column,
            elementColumn: problemLocation.column + offset.column,
            elementLine: problemLocation.line + offset.line,
            line: elementLocation.line + offset.line
        };
    }

    return {
        column: (elementLocation.column || problemLocation.column) + offset.column, // offset.column should usually be 0
        elementColumn: problemLocation.column + offset.column,
        elementLine: problemLocation.line + offset.line,
        line: elementLocation.line + problemLocation.line + offset.line
    };
};
