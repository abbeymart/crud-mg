/**
 * @Author: abbeymart | Abi Akindele | @Created: 2020-02-21 | @Updated: 2020-04-05
 * @Company: mConnect.biz | @License: MIT
 * @Description: crud-mg base class, for all CRUD operations
 */

// Import required module/function(s)
const {TransLog}   = require('@mconnect/translog');
const {mcMessages} = require('./locales/getMessage');

class CrudRecord {
    constructor(appDb, params, options = {}) {
        // options / defaults
        const auditColl = options && options.auditColl ? options.auditColl : 'audits';

        // params: {coll(string), actionParams[], queryParams{}, existParams[], token(string), userInfo{}}
        this.paramItems    = {
            coll           : params.coll ? params.coll : '',
            actionParams   : params.actionParams ? params.actionParams : [], // array
            queryParams    : params.queryParams ? params.queryParams : {}, // object, optional for update
            existParams    : params.existParams ? params.existParams : [], // array
            projectParams  : params && params.projectParams ? params.projectParams : {},
            sortParams     : params && params.sortParams ? params.sortParams : {},
            docId          : params && params.docId ? params.docId : [],    // array
            token          : params && params.token ? params.token : '',
            userInfo       : params && params.userInfo ? params.userInfo : '',
            skip           : params && params.skip ? params.skip : 0,
            limit          : params && params.limit ? params.limit : 10000,
            parentColl     : params && params.parentColl || [],
            childColl      : params && params.childColl || [],
            recursiveDelete: params && params.recursiveDelete || false,
        };
        this.dbConnect     = appDb;
        this.auditColl     = auditColl;
        this.serviceColl   = options && options.serviceColl ? options.serviceColl : 'services';
        this.accessColl    = options && options.accessColl ? options.accessColl : 'accessKeys';
        this.userColl      = options && options.userColl ? options.userColl : 'users';
        this.roleColl      = options && options.roleColl ? options.roleColl : 'roles';
        this.accessDb      = options && options.accessDb ? options.accessDb : appDb;
        this.auditDb       = options && options.auditDb ? options.auditDb : appDb;
        this.maxQueryLimit = options && options.maxQueryLimit && (typeof options.maxQueryLimit === 'number') ?
                             options.maxQueryLimit : 10000;
        this.logCreate     = options && options.logCreate && (typeof options.logCreate === 'boolean') ?
                             options.logCreate : false;
        this.logUpdate     = options && options.logUpdate && (typeof options.logUpdate === 'boolean') ?
                             options.logUpdate : false;
        this.logRead       = options && options.logRead && (typeof options.logRead === 'boolean') ?
                             options.logRead : false;
        this.logDelete     = options && options.logDelete && (typeof options.logDelete === 'boolean') ?
                             options.logDelete : false;
        this.mcMessages    = options && options.mcMessages && (typeof options.mcMessages === 'object') ?
                             options.mcMessages : mcMessages;

        this.transLog = TransLog(this.auditDb, {
            auditColl,
            messages     : this.mcMessages,
            maxQueryLimit: this.maxQueryLimit,
        });
    }
}

module.exports = CrudRecord;
