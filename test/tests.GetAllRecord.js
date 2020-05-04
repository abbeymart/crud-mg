/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-06 | @Updated: 2019-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, GetAllRecord
 */

const {suite, test, before} = require('mocha');
const ok                    = require('./assert');

const {dbConnect}    = require('./mgConnect');
const {newGetAllRecord, GetAllRecord} = require('../src/GetAllRecord');

let params,
    options = {};
before(() => {
    params = {
        coll: 'locations',
    };
});

suite('@mconnect/crud package Testing - GetAllRecord:', () => {
    suite('Positive testing:', () => {
        test('should return valid instance record, with new', () => {
            const res = new GetAllRecord(dbConnect, params, options);
            // console.log('result-new instance: ', res);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, with function-call', () => {
            const res = newGetAllRecord(dbConnect, params, options);
            // console.log('result-call instance: ', res);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid # of records', async () => {
            const resInstance = newGetAllRecord(dbConnect, params);
            const res         = await resInstance.getAllRecord();
            // console.log('result-records #: ', res);
            ok(res.value.length > 0, `response should be a non-empty array: ${res.value.length}`);
        });
        test('should return valid # of records from cache', async () => {
            const resInstance = newGetAllRecord(dbConnect, params);
            const res         = await resInstance.getAllRecord();
            // console.log('result-records: ', res.value[0]);
            ok((res.value.length > 0 && res.message === 'from cache'), `response should be a non-empty array: ${res.value.length}`);
        });
        test('should return valid # of records, by queryParams', async () => {
            params            = {
                coll       : 'locations',
                queryParams: {
                    code: 'US'
                }
            };
            const resInstance = newGetAllRecord(dbConnect, params);
            const res         = await resInstance.getAllRecord();
            // console.log('result-records #: ', res);
            ok(res.value.length >= 1, `response should be a non-empty array: ${res.value.length}`);
        });
    });

    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = newGetAllRecord('', params, options);
            const res         = await resInstance.getAllRecord() || {};
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
    });
});
