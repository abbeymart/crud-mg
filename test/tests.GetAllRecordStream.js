/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-10 | @Updated: 2020-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, GetAllRecordStream - similar to GetAllRecord, but streamed
 */

// 2 positive test cases, by queryParams and all
// 1 negative test case, unAuthorized

const {suite, test, before} = require('mocha');
const ok                    = require('./assert');

const {dbConnect}                                 = require('./mgConnect');
const {GetAllRecordStream, newGetAllRecordStream} = require('../src/GetAllRecordStream');

let params,
    options = {};
before(() => {
    params = {
        coll: 'locations',
    };
});

// after(() => {
//    process.exit();
// });

suite('@mconnect/crud package Testing - GetAllRecordStream:', () => {
    suite('Positive testing:', () => {
        test('should return valid instance record, with new', () => {
            const res = new GetAllRecordStream(dbConnect, params, options);
            // console.log('result-new instance: ', res);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, with function-call', () => {
            const res = newGetAllRecordStream(dbConnect, params, options);
            // console.log('result-call instance: ', res);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should stream/return valid # of all records', async () => {
            const resInstance = newGetAllRecordStream(dbConnect, params);
            const res         = await resInstance.getAllRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                // console.log('res-data: ', dataRec );
                await resItems.push(dataRec);
                ok(resItems.length > 0 && resItems[0]['code'], `response should be a non-empty array`);
            });
            // console.log('get-stream-result-records #: ', resItems);
            // ok(resItems.length > 20, `response should be a non-empty array: > 20`);
        });
        test('should stream/return valid # of records(4), by docId', async () => {
            params            = {
                coll : 'locations',
                docId: ['5b57f583b3db46019a22bd9c',
                        '5b57f583b3db46019a22bd9d',
                        '5b57f583b3db46019a22bd9e',
                        '5b57f583b3db46019a22bd9f',
                ],
            };
            const resInstance = newGetAllRecordStream(dbConnect, params);
            const res         = await resInstance.getAllRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                await resItems.push(dataRec);
                // console.log('first-item: ', resItems[0]['code']);
                ok(resItems.length > 0 && ['US', 'UK', 'JP', 'NG'].includes(resItems[0]['code']), `response should be a non-empty array`);
            });
            // ok(resItems.length === 4, `response should be a non-empty array: 4`);
        });
        test('should return valid # of records, by queryParams', async () => {
            params            = {
                coll       : 'locations',
                queryParams: {
                    code: 'US',
                }
            };
            const resInstance = newGetAllRecordStream(dbConnect, params);
            const res         = await resInstance.getAllRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                await resItems.push(dataRec);
                ok(resItems.length > 0 && resItems[0]['code'], `response should be a non-empty array`);
            });
            // ok(resItems.length === 1, `response should be a non-empty array: 1`);
        });
    });

    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = newGetAllRecordStream('', params, options);
            const res         = await resInstance.getAllRecordStream() || {};
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
    });
});
