import * as path from 'path';
import * as url from 'url';

import * as sinon from 'sinon';
import { EventEmitter2 } from 'eventemitter2';
import test from 'ava';

import * as misc from 'sonarwhal/dist/src/lib/utils/misc';
import { getAsUri } from 'sonarwhal/dist/src/lib/utils/get-as-uri';

import BabelConfigParser from '../src/parser';

test.beforeEach((t) => {
    t.context.sonarwhal = new EventEmitter2({
        delimiter: '::',
        maxListeners: 0,
        wildcard: true
    });
});

test('If no file is parsed, it should emit a `parse::babel-config::error::not-found` error', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('scan::end', {});

    t.true(t.context.sonarwhal.emitAsync.calledTwice);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::not-found');

    sandbox.restore();
});

test(`If a 'package.json' file is parsed, but it doesn't have the 'babel' property, it should emit a 'parse::babel-config::error::not-found' error`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: 'package.json',
        response: { body: { content: '{"prop":{"setting":true}}' } }
    });

    await t.context.sonarwhal.emitAsync('scan::end', {});

    t.is(t.context.sonarwhal.emitAsync.callCount, 3);
    t.is(t.context.sonarwhal.emitAsync.args[2][0], 'parse::babel-config::error::not-found');

    sandbox.restore();
});

test(`If the resource doesn't match the target file names, nothing should happen`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', { resource: '.babelrcconfig' });

    t.true(t.context.sonarwhal.emitAsync.calledOnce);

    sandbox.restore();
});

test('If the file contains an invalid json, it should fail', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: '{"invalidJson}' } }
    });

    t.true(t.context.sonarwhal.emitAsync.calledTwice);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::json');

    sandbox.restore();
});

test(`If .babelrc contains an invalid schema, it should emit the 'parse::babel-config::error::schema' event`, async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    const invalidSchemaContent = `{
        "plugins": ["transform-react-jsx"],
        "moduleId": 1,
        "ignore": [
          "foo.js",
          "bar/**/*.js"
        ]
      }`;

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});

test(`If 'package.json' contains an invalid 'babel' property, it should emit the 'parse::babel-config::error::schema' event`, async (t) => {
    const sandbox = sinon.sandbox.create();
    const invalidSchemaContent = `{
        "babel": {
          "plugins": ["transform-react-jsx"],
          "moduleId": 1,
          "ignore": [
            "foo.js",
            "bar/**/*.js"
          ]
        },
        "version": "1.0.0"
      }`;

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: 'package.json',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});

test('If the content type is unknown, it should still validate if the file name is a match', async (t) => {
    const sandbox = sinon.sandbox.create();

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new
    const invalidSchemaContent = `{
        "plugins": ["transform-react-jsx"],
        "moduleId": 1,
        "ignore": [
          "foo.js",
          "bar/**/*.js"
        ]
      }`;

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: '.babelrc',
        response: { body: { content: invalidSchemaContent } }
    });

    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::schema');

    sandbox.restore();
});

test('If we receive a valid json with a valid name, it should emit the event parse::babel-config::end', async (t) => {
    const sandbox = sinon.sandbox.create();

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new

    const configPath = path.join(__dirname, 'fixtures', 'valid', '.babelrc');
    const validJSON = misc.loadJSONFile(configPath);

    const parsedJSON = {
        ast: true,
        code: true,
        comments: true,
        compact: 'auto',
        env: {
            test: {
                presets:
                    [['env',
                        { targets: { node: 'current' } }]]
            }
        },
        filename: 'unknown',
        keepModuleIdExtensions: false,
        moduleIds: false,
        plugins: ['syntax-dynamic-import', 'transform-object-rest-spread'],
        presets: [['env', {
            modules: false,
            targets: {
                browsers:
                    ['last 2 versions', '> 5% in BE'],
                uglify: true
            }
        }]],
        retainLines: false,
        sourceMaps: false
    };

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: url.format(getAsUri(configPath)),
        response: { body: { content: JSON.stringify(validJSON) } }
    });

    await t.context.sonarwhal.emitAsync('scan::end');

    // 3 times, the two previous call and the parse.
    t.is(t.context.sonarwhal.emitAsync.callCount, 3);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::end');
    t.deepEqual(t.context.sonarwhal.emitAsync.args[1][1].originalConfig, validJSON);
    t.deepEqual(t.context.sonarwhal.emitAsync.args[1][1].config, parsedJSON);

    sandbox.restore();
});

test('If we receive a valid json with an extends, it should emit the event parse::babel-config::end with the right data', async (t) => {
    const sandbox = sinon.sandbox.create();

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new

    const configPath = path.join(__dirname, 'fixtures', 'valid-with-extends', '.babelrc');
    const validJSON = misc.loadJSONFile(configPath);

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: url.format(getAsUri(configPath)),
        response: { body: { content: JSON.stringify(validJSON) } }
    });

    await t.context.sonarwhal.emitAsync('scan::end');

    // 3 times, the two previous call and the parse.
    t.is(t.context.sonarwhal.emitAsync.callCount, 3);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::end');
    t.deepEqual(t.context.sonarwhal.emitAsync.args[1][1].originalConfig, validJSON);
    t.is(t.context.sonarwhal.emitAsync.args[1][1].config.presets[0][1].targets.uglify, false);

    sandbox.restore();
});

test('If we receive a json with an extends with a loop, it should emit the event parse::babel-config::error::circular', async (t) => {
    const sandbox = sinon.sandbox.create();

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new

    const configPath = path.join(__dirname, 'fixtures', 'valid-with-extends-loop', '.babelrc');
    const configuration = misc.readFile(configPath);

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: url.format(getAsUri(configPath)),
        response: { body: { content: configuration } }
    });

    // 2 times, the previous call and the parse error.
    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::circular');

    sandbox.restore();
});

test('If we receive a json with an extends with an invalid json, it should emit the event parse::typescript-config::error::extends', async (t) => {
    const sandbox = sinon.sandbox.create();

    sandbox.spy(t.context.sonarwhal, 'emitAsync');

    new BabelConfigParser(t.context.sonarwhal); // eslint-disable-line no-new

    const configPath = path.join(__dirname, 'fixtures', 'valid-with-extends-invalid', '.babelrc');
    const configuration = misc.readFile(configPath);

    await t.context.sonarwhal.emitAsync('fetch::end::json', {
        resource: url.format(getAsUri(configPath)),
        response: { body: { content: configuration } }
    });

    // 2 times, the previous call and the parse error.
    t.is(t.context.sonarwhal.emitAsync.callCount, 2);
    t.is(t.context.sonarwhal.emitAsync.args[1][0], 'parse::babel-config::error::extends');

    sandbox.restore();
});
