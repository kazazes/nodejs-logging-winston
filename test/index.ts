/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as proxyquire from 'proxyquire';
import * as nodeutil from 'util';
import * as types from '../src/types/core';

describe('logging-winston', () => {
  let fakeLogInstance: types.StackdriverLogging;
  let fakeLoggingOptions_: types.Options|null;
  let fakeLogName_: string|null;

  function fakeLogging(options: types.Options) {
    fakeLoggingOptions_ = options;
    return {
      log: (logName: string) => {
        fakeLogName_ = logName;
        return fakeLogInstance;
      },
    };
  }

  class FakeTransport {
    // transportCalledWith_ takes arguments which cannot be determined type.
    // tslint:disable-next-line:no-any
    transportCalledWith_: any;
    constructor() {
      this.transportCalledWith_ = arguments;
    }
  }

  const fakeWinston = {
    transports: {},
    Transport: FakeTransport,
  };

  const loggingWinstonLib = proxyquire('../src/index.js', {
    '@google-cloud/logging': fakeLogging,
    winston: fakeWinston,
  });
  // loggingWinston is LoggingWinston namespace which cannot be determined type.
  // tslint:disable-next-line:no-any
  let loggingWinston: any;

  const OPTIONS: types.Options = {
    logName: 'log-name',
    levels: {
      one: 1,
    },
    resource: {},
    serviceContext: {
      service: 'fake-service',
    },
  };

  beforeEach(() => {
    fakeLogInstance = {};
    fakeLoggingOptions_ = null;
    fakeLogName_ = null;
    loggingWinston = new loggingWinstonLib.LoggingWinston(OPTIONS);
  });

  describe('instantiation', () => {
    it('should default to logging.write scope', () => {
      assert.deepStrictEqual((fakeLoggingOptions_ as types.Options).scopes, [
        'https://www.googleapis.com/auth/logging.write',
      ]);
    });

    it('should initialize Log instance using provided scopes', () => {
      const fakeScope = 'fake scope';

      const optionsWithScopes: types.Options = Object.assign({}, OPTIONS);
      optionsWithScopes.scopes = fakeScope;

      const loggingWinston =
          new loggingWinstonLib.LoggingWinston(optionsWithScopes);

      assert.deepStrictEqual(fakeLoggingOptions_, optionsWithScopes);
    });

    it('should assign itself to winston.transports', () => {
      assert.strictEqual(
          // StackDriverLogging is added to winston.transports.
          // tslint:disable-next-line:no-any
          (fakeWinston.transports as any).StackdriverLogging,
          loggingWinstonLib.LoggingWinston);
    });

    it('should localize inspectMetadata to default value', () => {
      assert.strictEqual(loggingWinston.inspectMetadata, false);
    });

    it('should localize the provided options.inspectMetadata', () => {
      const optionsWithInspectMetadata = Object.assign({}, OPTIONS, {
        inspectMetadata: true,
      });

      const loggingWinston =
          new loggingWinstonLib.LoggingWinston(optionsWithInspectMetadata);
      assert.strictEqual(loggingWinston.inspectMetadata, true);
    });

    it('should localize provided levels', () => {
      assert.strictEqual(loggingWinston.levels, OPTIONS.levels);
    });

    it('should default to npm levels', () => {
      const optionsWithoutLevels = Object.assign({}, OPTIONS);
      delete optionsWithoutLevels.levels;

      const loggingWinston =
          new loggingWinstonLib.LoggingWinston(optionsWithoutLevels);
      assert.deepStrictEqual(loggingWinston.levels, {
        error: 3,
        warn: 4,
        info: 6,
        verbose: 7,
        debug: 7,
        silly: 7,
      });
    });

    it('should localize Log instance using default name', () => {
      const loggingOptions = Object.assign({}, fakeLoggingOptions_);
      delete (loggingOptions as types.Options).scopes;

      assert.deepStrictEqual(loggingOptions, OPTIONS);
      assert.strictEqual(fakeLogName_, OPTIONS.logName);
    });

    it('should localize Log instance using provided name', () => {
      const logName = 'log-name-override';

      const optionsWithLogName = Object.assign({}, OPTIONS);
      optionsWithLogName.logName = logName;

      const loggingWinston =
          new loggingWinstonLib.LoggingWinston(optionsWithLogName);

      const loggingOptions = Object.assign({}, fakeLoggingOptions_);
      delete (loggingOptions as types.Options).scopes;

      assert.deepStrictEqual(loggingOptions, optionsWithLogName);
      assert.strictEqual(fakeLogName_, logName);
    });

    it('should localize the provided resource', () => {
      assert.strictEqual(loggingWinston.resource, OPTIONS.resource);
    });

    it('should localize the provided service context', () => {
      assert.strictEqual(loggingWinston.serviceContext, OPTIONS.serviceContext);
    });
  });

  describe('log', () => {
    const LEVEL = Object.keys(OPTIONS.levels as {[name: string]: number})[0];
    const STACKDRIVER_LEVEL = 'alert';  // (code 1)
    const MESSAGE = 'message';
    const METADATA = {
      value: () => {},
    };

    beforeEach(() => {
      // tslint:disable-next-line:no-any
      fakeLogInstance.entry = (() => {}) as any;
      loggingWinston.stackdriverLog.emergency = () => {};
      loggingWinston.stackdriverLog[STACKDRIVER_LEVEL] = () => {};
    });

    it('should throw on a bad log level', () => {
      assert.throws(() => {
        loggingWinston.log(
            {level: 'non-existent-level', message: MESSAGE, metadata: METADATA},
            assert.ifError);
      }, /Unknown log level: non-existent-level/);
    });

    it('should not throw on `0` log level', () => {
      const options = Object.assign({}, OPTIONS, {
        levels: {
          zero: 0,
        },
      });

      loggingWinston = new loggingWinstonLib.LoggingWinston(options);
      loggingWinston.log({level: 'zero', message: 'test message'});
    });

    it('should properly create an entry', (done) => {
      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };

      loggingWinston.log(
        { level: LEVEL, message: MESSAGE, metadata: METADATA }, 
        assert.ifError);
    });

    it('should accept any metadata key', (done) => {
      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };

      loggingWinston.log(
        { level: LEVEL, message: MESSAGE, something: METADATA }, 
        assert.ifError);
    });

    it('should append stack when metadata is an error', (done) => {
      const error: Error = {
        stack: 'the stack',
        name: 'very bad error',
        message: 'horrible situation'
      };

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(data, {
              message: MESSAGE + ' ' + error.stack,
              error,
              serviceContext: OPTIONS.serviceContext,
            });
            done();
          };

      loggingWinston.log({ level: LEVEL, message: MESSAGE, error }, assert.ifError);
    });

    it('should use stack when metadata is err without message', (done) => {
      const error = {
        stack: 'the stack',
      };

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(data, {
              message: error.stack,
              metadata: error,
              serviceContext: OPTIONS.serviceContext,
            });
            done();
          };

      loggingWinston.log({ level: LEVEL, error }, '', assert.ifError);
    });

    it('should not require metadata', (done) => {
      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: {},
            });
            done();
          };

      loggingWinston.log({ level: LEVEL, message: MESSAGE }, assert.ifError);
    });

    it('should inspect metadata when inspectMetadata is set', (done) => {
      loggingWinston.inspectMetadata = true;

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            const expectedWinstonMetadata = {};

            for (const prop of Object.keys(METADATA)) {
              // metadata does not have index signature.
              // tslint:disable-next-line:no-any
              (expectedWinstonMetadata as any)[prop] =
                  // tslint:disable-next-line:no-any
                  nodeutil.inspect((METADATA as any)[prop]);
            }
            assert.deepStrictEqual(data.metadata, expectedWinstonMetadata);

            done();
          };

      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);
    });

    it('should promote httpRequest property to metadata', (done) => {
      const HTTP_REQUEST = {
        statusCode: 418,
      };
      const metadataWithRequest = Object.assign(
          {
            httpRequest: HTTP_REQUEST,
          },
          METADATA);

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
              httpRequest: HTTP_REQUEST,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, metadataWithRequest }, assert.ifError);
    });

    it('should promote labels from metadata to log entry', (done) => {
      const LABELS = {labelKey: 'labelValue'};
      const metadataWithLabels = Object.assign({labels: LABELS}, METADATA);

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
              labels: LABELS,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, metadataWithLabels }, assert.ifError);
    });

    it('should promote prefixed trace property to metadata', (done) => {
      const metadataWithTrace = Object.assign({}, METADATA);
      const loggingTraceKey =
          loggingWinstonLib.LoggingWinston.LOGGING_TRACE_KEY;
      // metadataWithTrace does not have index signature.
      // tslint:disable-next-line:no-any
      (metadataWithTrace as any)[loggingTraceKey] = 'trace1';

      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
              trace: 'trace1',
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, metadataWithTrace }, assert.ifError);
    });

    it('should set trace metadata from agent if available', (done) => {
      const oldTraceAgent = global._google_trace_agent;
      global._google_trace_agent = {
        getCurrentContextId: () => {
          return 'trace1';
        },
        getWriterProjectId: () => {
          return 'project1';
        },
      };
      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
              trace: 'projects/project1/traces/trace1',
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
            done();
          };

      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);

      global._google_trace_agent = oldTraceAgent;
    });

    it('should leave out trace metadata if trace unavailable', () => {
      loggingWinston.stackdriverLog.entry =
          (entryMetadata: types.StackdriverEntryMetadata,
           data: types.StackdriverData) => {
            assert.deepStrictEqual(entryMetadata, {
              resource: loggingWinston.resource,
            });
            assert.deepStrictEqual(data, {
              message: MESSAGE,
              metadata: METADATA,
            });
          };

      const oldTraceAgent = global._google_trace_agent;

      global._google_trace_agent = {};
      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);

      global._google_trace_agent = {
        getCurrentContextId: () => {
          return null;
        },
        getWriterProjectId: () => {
          return null;
        },
      };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);

      global._google_trace_agent = {
        getCurrentContextId: () => {
          return null;
        },
        getWriterProjectId: () => {
          return 'project1';
        },
      };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);

      global._google_trace_agent = {
        getCurrentContextId: () => {
          return 'trace1';
        },
        getWriterProjectId: () => {
          return null;
        },
      };
      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, assert.ifError);

      global._google_trace_agent = oldTraceAgent;
    });

    it('should write to the log', (done) => {
      const entry = {};

      loggingWinston.stackdriverLog.entry = () => {
        return entry;
      };

      loggingWinston.stackdriverLog[STACKDRIVER_LEVEL] =
          (entry_: types.StackdriverEntry, callback: () => void) => {
            assert.strictEqual(entry_, entry);
            callback();  // done()
          };

      loggingWinston.log({ level: LEVEL, message: MESSAGE, METADATA }, done);
    });
  });

  describe('label and labels', () => {
    const LEVEL = Object.keys(OPTIONS.levels as {[name: string]: number})[0];
    const STACKDRIVER_LEVEL = 'alert';  // (code 1)
    const MESSAGE = 'message';
    const PREFIX = 'prefix';
    const LABELS = {label1: 'value1'};
    const METADATA = {value: () => {}, labels: {label2: 'value2'}};

    beforeEach(() => {
      const opts = Object.assign({}, OPTIONS, {
        prefix: PREFIX,
        labels: LABELS,
      });

      loggingWinston = new loggingWinstonLib.LoggingWinston(opts);
    });

    it('should properly create an entry with labels and [prefix] message',
       (done) => {
         loggingWinston.stackdriverLog.entry =
             (entryMetadata1: types.StackdriverEntryMetadata,
              data1: types.StackdriverData) => {
               assert.deepStrictEqual(entryMetadata1, {
                 resource: loggingWinston.resource,
                 // labels should have been merged.
                 labels: {
                   label1: 'value1',
                   label2: 'value2',
                 }
               });
               assert.deepStrictEqual(data1, {
                 message: `[${PREFIX}] ${MESSAGE}`,
                 metadata: METADATA,
               });

               const metadataWithoutLabels = Object.assign({}, METADATA);
               delete metadataWithoutLabels.labels;

               loggingWinston.stackdriverLog.entry =
                   (entryMetadata2: types.StackdriverEntryMetadata,
                    data2: types.StackdriverData) => {
                     console.log(entryMetadata2.labels);
                     assert.deepStrictEqual(entryMetadata2, {
                       resource: loggingWinston.resource,
                       labels: {label1: 'value1'}
                     });
                     assert.deepStrictEqual(data2, {
                       message: `[${PREFIX}] ${MESSAGE}`,
                       metadata: METADATA,
                     });
                     done();
                   };

               loggingWinston.log(
                { level: LEVEL, message: MESSAGE, metadataWithoutLabels }, assert.ifError);
             };

         loggingWinston.log({ level: LEVEL, message: MESSAGE, metadata: METADATA }, assert.ifError);
       });
  });
});
