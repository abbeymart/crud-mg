/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-10 | @Updated: 2019-08-12
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, SaveRecord
 */

// 8 positive test cases: instance, function-call, create(2), update by docId(2), update by queryParams(2)
// 1 negative test cases, access permission

const ObjectId              = require('mongodb').ObjectID;
const {suite, test, before} = require('mocha');
const ok                    = require('./assert');

const {dbConnect}             = require('./mgConnect');
const SaveRecord              = require('../src/SaveRecord');
const {tokenId, testUserInfo} = require('./token');

let params,
    actionParams              = [
        {
            code     : 'OY2b',
            name     : 'Oyo State',
            category : 'State',
            desc     : 'The State of Oyo in Nigeria',
            parentId : '5b57f583b3db46019a22bd9f',
            lang     : 'en-US',
            isActive : true,
            currency : 'NGN',
            phoneCode: 100,
        }
    ],
    actionParamsIdError       = [
        {
            _id      : '',
            code     : 'OY2b',
            name     : 'Oyo State',
            category : 'State',
            desc     : 'The State of Oyo in Nigeria',
            parentId : '5b57f583b3db46019a22bd9f',
            lang     : 'en-US',
            isActive : true,
            currency : 'NGN',
            phoneCode: 100,
        }
    ],
    existParamsCreate         = [
        {
            code    : 'OY2b',
            parentId: ObjectId('5b57f583b3db46019a22bd9f')
        },
    ],
    actionParamsUpdate        = [
        {
            _id        : '5b57f583b3db46019a22bd9d',
            createdBy  : 'XBnv8ghuNYagAWn7M',
            createdDate: '2015-03-15T21:11:46.965Z',
            isActive   : true,
            updatedBy  : '5b0e139b3151184425aae01c',
            updatedDate: '2018-08-20T01:10:23.454Z',
            parentId   : '5b7a0e03b967e171cd0ae99c',
            code       : 'UK',
            currency   : 'GBP',
            desc       : 'The United Kingdom Update3a',
            lang       : 'en-GB',
            name       : 'United Kingdom Updated',
            phoneCode  : 44,
            timezone   : '',
            lat        : 0,
            long       : 0,
            category   : 'Country'
        }
    ],
    actionParamsUpdateIdError = [
        {
            _id        : '',
            createdBy  : 'XBnv8ghuNYagAWn7M',
            createdDate: '2015-03-15T21:11:46.965Z',
            isActive   : true,
            updatedBy  : '5b0e139b3151184425aae01c',
            updatedDate: '2018-08-20T01:10:23.454Z',
            parentId   : '5b7a0e03b967e171cd0ae99c',
            code       : 'UK',
            currency   : 'GBP',
            desc       : 'The United Kingdom Update3a',
            lang       : 'en-GB',
            name       : 'United Kingdom Updated',
            phoneCode  : 44,
            timezone   : '',
            lat        : 0,
            long       : 0,
            category   : 'Country'
        }
    ],
    existParamsUpdate         = [
        {
            _id     : {$ne: ObjectId('5b57f583b3db46019a22bd9d')},
            code    : 'GB',
            parentId: '5b7a0e03b967e171cd0ae99c'
        }
    ],
    queryParams               = {},
    token                     = '',
    userInfo                  = {},
    options                   = {};
before(() => {
    // update token and userInfo for currently logged-in user
    token    = tokenId;
    userInfo = testUserInfo;
    params   = {
        coll       : 'locations',
        actionParams,
        queryParams,
        existParams: existParamsCreate,
        token,
        userInfo,
    };
});


suite('@mconnect/crud package Testing - SaveRecord:', () => {
    suite('Positive testing: Admin access', () => {
        test('should return valid instance record, with new call', () => {
            const res = new SaveRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, function-call', () => {
            const res = new SaveRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should successfully create new record', async () => {
            params            = {
                coll       : 'locations',
                actionParams,
                queryParams,
                existParams: existParamsCreate,
                token,
                userInfo,
            };
            const resInstance = SaveRecord(dbConnect, params);
            const res         = await resInstance.saveRecord();
            ok(res.code === 'success' || res.code === 'exists', `response-code should be: success or exists`);
        });
        test('should successfully update existing record', async () => {
            params            = {
                coll        : 'locations',
                actionParams: actionParamsUpdate,
                queryParams,
                existParams : existParamsUpdate,
                token,
                userInfo,
            };
            const resInstance = SaveRecord(dbConnect, params);
            const res         = await resInstance.saveRecord();
            ok(res.code === 'success', `response-code should be: success`);
        });
    });
    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = SaveRecord('', params, options);
            const res         = await resInstance.saveRecord();
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
        test('create: should passed the null value for Id, return exists', async () => {
            params            = {
                coll        : 'locations',
                actionParams: actionParamsIdError,
                queryParams,
                existParams : existParamsCreate,
                token,
                userInfo,
            };
            const resInstance = SaveRecord(dbConnect, params);
            const res         = await resInstance.saveRecord();
            console.log('create-id-error: ', res);
            ok(res.code === 'exists', `response-code should be: exists`);
        });
    });
});
