/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-12 | @Updated: 2019-08-12
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud testing, DeleteRecord
 */

// 5 positive test cases: instantiated(2), delete by docId, docIds, and queryParams
// 4 negative test cases, access permission, paramError, non-admin-query delete & sub-items

// const ObjectId              = require('mongodb').ObjectID;
const {suite, test, before} = require('mocha');
const ok                    = require('./assert');

const {dbConnect}             = require('./mgConnect');
const DeleteRecord            = require('../src/DeleteRecord');
const {tokenId, testUserInfo} = require('./token');

let params,
    queryParams = {
        code: 'OY',
    },
    token       = '',
    userInfo    = {},
    options     = {};
before(() => {
    // update token and userInfo for currently logged-in user
    token    = tokenId;
    userInfo = testUserInfo;
    params   = {
        coll      : 'locations',
        parentColl: ['locations'],
        queryParams,
        token,
        userInfo,
    };
});

// after(() => {
//    process.exit();
// });

suite('@mconnect/crud package Testing - DeleteRecord:', () => {
    suite('Positive testing: Admin access', () => {
        test('should return valid instance record, with new call', () => {
            const res = new DeleteRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should return valid instance record, function-call', () => {
            const res = new DeleteRecord(dbConnect, params, options);
            ok(typeof res === 'object', `response should be an object: ${res}`);
        });
        test('should successfully delete record, by docId', async () => {
            params            = {
                coll      : 'locations',
                parentColl: ['locations'],
                docId     : ['5d02f4417288e1397420f75a'],
                token,
                userInfo,
            };
            const resInstance = DeleteRecord(dbConnect, params);
            const res         = await resInstance.deleteRecord();
            ok(res.code === 'success' || res.code === 'notFound', `response-code should be: success or notFound`);
        });
        test('should successfully delete records, by docIds', async () => {
            params            = {
                coll      : 'locations',
                parentColl: ['locations'],
                childColl : ['locations'],
                docId     : ['5d02f6616942ac49cccb0b6c', '5d02f569cf74493f78f926cc'],
                token,
                userInfo,
            };
            const resInstance = DeleteRecord(dbConnect, params);
            const res         = await resInstance.deleteRecord();
            ok(res.code === 'success' || res.code === 'notFound', `response-code should be: success or notFound`);
        });
        test('should successfully delete records, by queryParams (admin)', async () => {
            params            = {
                coll       : 'locations',
                parentColl : ['locations'],
                childColl  : ['locations'],
                queryParams: {
                    code: 'OY2b',
                },
                token,
                userInfo,
            };
            const resInstance = DeleteRecord(dbConnect, params);
            const res         = await resInstance.deleteRecord();
            console.log('param-delete-res: ', res);
            ok(res.code === 'success' || res.code === 'notFound', `response-code should be: success or notFound`);
        });
    });
    suite('Negative testing:', () => {
        test('should return paramsError, with null appDb', async () => {
            const resInstance = DeleteRecord('', params, options);
            const res         = await resInstance.deleteRecord();
            ok(res['code'] === 'paramsError', `response should be a function: ${res['code']}`);
        });
        test('should return unAuthorized, with invalid token', async () => {
            params.token      = 'invalid';
            params.userInfo   = {};
            const resInstance = DeleteRecord(dbConnect, params, options);
            const res         = await resInstance.deleteRecord();
            ok(res['code'] === 'unAuthorized', `response should be : unAuthorized`);
        });
        test('should return subItem msgType/code, for parent item', async () => {
            params            = {
                coll      : 'locations',
                parentColl: ['locations'],
                childColl : ['locations'],
                docId     : ['5d02f4417288e1397420f75a'],
                token,
                userInfo,
            };
            const resInstance = DeleteRecord(dbConnect, params);
            const res         = await resInstance.deleteRecord();
            ok(res.code === 'subItem' || res.code === 'notFound', `response-code should be: subItem or notFound`);
        });
        test('should successfully delete records, by queryParams (non-admin)', async () => {
            params            = {
                coll       : 'locations',
                parentColl : ['locations'],
                childColl  : ['locations'],
                queryParams: {
                    code: 'OY2b',
                },
                token      : 'absdfjsjflksdjkllfhsjkbflsjfkjlslkfskflfsklfsfk',
                userInfo   : {},
            };
            const resInstance = DeleteRecord(dbConnect, params);
            const res         = await resInstance.deleteRecord();
            ok(res.code === 'removeError' || res.code === 'unAuthorized', `response-code should be: removeError or unAuthorized`);
        });
    });
});
