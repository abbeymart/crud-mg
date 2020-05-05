/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-10 | @Updated: 2020-05-05
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, GetRecordStream - similar to GetAllRecord, but streamed
 */

// 5 positive test cases, instances, query all, by id, ids and queryParams
// 1 negative test case, unAuthorized

const {suite, test, before} = require('mocha');
const ok                    = require('./assert');
const {dbConnect}           = require('./mgConnect');

const {GetRecordStream, newGetRecordStream} = require('../src/GetRecordStream');
const {tokenId, testUserInfo}               = require('./token');

let params,
    token    = '',
    userInfo = {},
    options  = {};
before(() => {
    // update token and userInfo for currently logged-in user
    token    = tokenId;
    userInfo = testUserInfo;
    params   = {
        coll: 'locations',
        token,
        userInfo,
    };
});

suite('@mconnect/crud package Testing - GetRecordStream:', () => {
    suite('Positive testing:', () => {
        test('should return valid instance record, with new', () => {
            const res = new GetRecordStream(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, with function-call', () => {
            const res = newGetRecordStream(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should stream/return valid # of all records', async () => {
            const resInstance = newGetRecordStream(dbConnect, params);
            const res         = await resInstance.getRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                await resItems.push(dataRec);
                ok(resItems.length > 0 && resItems[0]['code'], `response should be a non-empty array`);
            });
        });
        test('should stream/return valid # of records(4), by docId', async () => {
            params            = {
                coll : 'locations',
                docId: ['5b57f583b3db46019a22bd9c',
                        '5b57f583b3db46019a22bd9d',
                        '5b57f583b3db46019a22bd9e',
                        '5b57f583b3db46019a22bd9f',
                ],
                token,
                userInfo,
            };
            const resInstance = newGetRecordStream(dbConnect, params);
            const res         = await resInstance.getRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                await resItems.push(dataRec);
                ok(resItems.length > 0 && ['US', 'UK', 'JP', 'NG'].includes(resItems[0]['code']), `response should be a non-empty array`);
            });
        });
        test('should return valid # of records, by queryParams', async () => {
            params            = {
                coll       : 'locations',
                queryParams: {
                    code: 'US',
                },
                token,
                userInfo,
            };
            const resInstance = newGetRecordStream(dbConnect, params);
            const res         = await resInstance.getRecordStream();
            let resItems      = [];
            res.on('data', async (dataRec) => {
                await resItems.push(dataRec);
                ok(resItems.length > 0 && resItems[0]['code'], `response should be a non-empty array`);
            });
        });
    });

    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = newGetRecordStream('', params, options);
            const res         = await resInstance.getRecordStream() || {};
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
    });
});
