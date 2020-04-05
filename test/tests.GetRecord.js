/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-09 | @Updated: 2019-08-12
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, GetRecord
 */

// 3 positive test suites (admin, role, userId), with 5 test cases each, +2 instance/fn-call test-cases
// 1 negative test suite, with 1(or 2) test case(s)
// TODO: test for non-admin user and by role

const {suite, test, before} = require('mocha');
const ok                    = require('./assert');

const {dbConnect}             = require('./mgConnect');
const GetRecord               = require('../src/GetRecord');
const {tokenId, testUserInfo} = require('./token');

let params,
    docId    = ['5b57f583b3db46019a22bd9c'],
    docIds   = ['5b57f583b3db46019a22bd9c', '5b57f583b3db46019a22bd9d'],
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

suite('@mconnect/crud package Testing - GetRecord:', () => {
    suite('Positive testing: Admin access', () => {
        test('should return valid instance record, with new call', () => {
            const res = new GetRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, function-call', () => {
            const res = new GetRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid # of record(s): all records', async () => {
            const resInstance = GetRecord(dbConnect, params);
            const res         = await resInstance.getRecord();
            ok(res.value.length > 0, `response should be a non-empty array: ${res.value.length}`);
        });
        test('should return valid # of records from cache: all records ', async () => {
            const resInstance = GetRecord(dbConnect, params);
            const res         = await resInstance.getRecord();
            ok((res.value.length > 0 && res.message === 'from cache'), `response should be a non-empty array: ${res.value.length}`);
        });
        test('should return valid # of record(s): by queryParams', async () => {
            const newParams   = {
                coll       : 'locations',
                token,
                userInfo,
                queryParams: {code: 'US'}
            };
            const resInstance = GetRecord(dbConnect, newParams);
            const res         = await resInstance.getRecord();
            ok(res.value.length === 1, `response should be a non-empty array: ${res.value.length}`);
        });
        test('should return valid # of record: single-record, by docID', async () => {
            const newParams   = {
                coll : 'locations',
                token,
                userInfo,
                docId: docId
            };
            const resInstance = GetRecord(dbConnect, newParams);
            const res         = await resInstance.getRecord();
            ok((res.value.length === 1 && res.value[0]._id.toString() === docId[0]), `response should be an object, with ID: ${docId[0]}`);
        });
        test('should return valid # of records: multiple-records, by docIDs', async () => {
            const newParams   = {
                coll : 'locations',
                token,
                userInfo,
                docId: docIds
            };
            const resInstance = GetRecord(dbConnect, newParams);
            const res         = await resInstance.getRecord();
            ok(res.value.length === 2, `response should be a non-empty array: ${res.value.length}`);
        });
    });

    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = GetRecord('', params, options);
            const res         = await resInstance.getRecord();
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
    });
})
;
