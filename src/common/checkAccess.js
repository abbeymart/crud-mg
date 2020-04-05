/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-01-12 | @Updated: 2019-06-10
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/auth - access level / roles assignment
 */

// Import required package(s) / module(s)
const ObjectId           = require('mongodb').ObjectID;
const {ValidateCrud}     = require('@mconnect/validate-crud');
const {getResMessage}    = require('@mconnect/res-messages');
const {getParamsMessage} = require('@mconnect/utils');

const {mcMessages}         = require('../locales/getMessage');
const roleAssignedServices = require('./roleServices');

async function checkAccess(dbConnect, options = {}) {
    // validate DB params
    const accessColl = options && options.accessColl ? options.accessColl : 'accessKeys';
    const userColl   = options && options.userColl ? options.userColl : 'users';
    const roleColl   = options && options.roleColl ? options.roleColl : 'roles';
    const token      = options && options.token ? options.token : '';
    const userInfo   = options && options.userInfo ? options.userInfo : {};

    this.mcMessages = options && options.mcMessages && (typeof options.mcMessages === 'object') ?
                      options.mcMessages : mcMessages;

    // Check/validate token / userInfo params
    const paramItems = {
        token,
        userInfo,
    };

    const validateRecord = ValidateCrud({messages: this.mcMessages});

    const errors = validateRecord.validateCheckAccess(paramItems);
    if (!dbConnect || typeof dbConnect !== 'function') {
        errors.dbConnect = 'valid db-connection handler (of type function) is required';
    }
    if (Object.keys(errors).length > 0) {
        return getParamsMessage(errors);
    }

    // validate current user active status: by token (API) and/or user/loggedIn-status (views/UI)
    let userActive   = false,
        userId       = '',
        isAdmin      = false,
        userRole     = '',
        userRoles    = [],
        roleServices = [],
        currentUser  = '';

    // token access
    if (token) {
        // define db-client-handle and result variables
        let accessRecord = '';

        try {
            // use / activate database
            const db = await dbConnect();

            const accessCol = db.collection(accessColl);
            const userCol   = db.collection(userColl);

            // get user record by token
            accessRecord = await accessCol.findOne({
                token: token
            });
            // validate access / login-status
            if (accessRecord && Object.keys(accessRecord).length > 0) {
                if (Date.now() > parseInt(accessRecord.expire)) {
                    return getResMessage('tokenExpired', {
                        message: 'Access expired: please login to continue.',
                    });
                }
            } else {
                return getResMessage('unAuthorized', {
                    message: 'Unauthorized: please ensure that you are logged-in',
                });
            }

            // current-user status/info:
            currentUser = await userCol.findOne({
                _id     : accessRecord.userId,
                isActive: true
            });
            if (currentUser && Object.keys(currentUser).length > 0) {
                userActive = currentUser.isActive;
                userId     = currentUser._id;
                isAdmin    = currentUser.profile.isAdmin || false;
                // get default user-role
                if (currentUser.defaultGroup) {
                    userRole = currentUser.defaultGroup;
                }
                if (currentUser.groups && currentUser.groups.length > 0) {
                    userRoles = currentUser.groups;
                }
                // get the services/access-level by userRole/Group
                roleServices = userRole ? await roleAssignedServices(dbConnect, userRole, roleColl) : [];
                // console.log('role-services: ', roleServices);
                return getResMessage('success', {
                    value: {
                        userActive,
                        userId,
                        isAdmin,
                        userRole,
                        userRoles,
                        roleServices,
                    }
                });
            }
            return getResMessage('unAuthorized', {
                message: 'Unauthorized: user information not found or inactive',
            });
        } catch (error) {
            console.error('Error-getting data: ', error.stack);
            return getResMessage('notFound', {
                value: error,
            });
        }
    }

    // userLogin access, from server-side
    if (userInfo && Object.keys(userInfo).length > 0 && userInfo.isActive) {
        // define db-client-handle and result variables
        let accessRecord = '';

        try {
            // use / activate database
            const db = await dbConnect();

            const userCol   = db.collection(userColl);
            const accessCol = db.collection(accessColl);

            // validate access / login-status
            accessRecord = await accessCol.findOne({
                userId: ObjectId(userInfo.userId)
            });
            if (accessRecord && Object.keys(accessRecord).length > 0) {
                if (Date.now() > parseInt(accessRecord.expire)) {
                    return getResMessage('tokenExpired', {
                        message: 'Access expired: please login to continue.',
                    });
                }
            } else {
                return getResMessage('unAuthorized', {
                    message: 'Unauthorized: please ensure that you are logged-in',
                });
            }

            // current-user status/info:
            currentUser = await userCol.findOne({
                _id     : accessRecord.userId,
                isActive: true
            });
            if (currentUser && Object.keys(currentUser).length > 0) {
                userActive = currentUser.isActive;
                userId     = currentUser._id;
                isAdmin    = currentUser.profile.isAdmin || false;
                // get default user-role
                if (currentUser.defaultGroup) {
                    userRole = currentUser.defaultGroup;
                }
                if (currentUser.groups && currentUser.groups.length > 0) {
                    userRoles = currentUser.groups;
                }
                // get the services/access-level by userRole/Group
                roleServices = userRole ? await roleAssignedServices(dbConnect, userRole, roleColl) : [];
                return getResMessage('success', {
                    value: {
                        userActive,
                        userId,
                        isAdmin,
                        userRole,
                        userRoles,
                        roleServices,
                    }
                });
            }
            return getResMessage('unAuthorized', {
                message: 'Unauthorized: user information not found or inactive',
            });
        } catch (error) {
            // if( client ) client.close();
            console.error('Error-getting data: ', error.stack);
            return getResMessage('notFound', {
                value: error,
            });
        }
    }

    // un-authorized, if none of the conditions above was fulfilled:
    console.log('Unauthorized: Please ensure that you have a registered account and logged-in');
    return getResMessage('unAuthorized', {
        message: 'Unauthorized: Please ensure that you have a registered account and logged-in',
    });
}

module.exports = checkAccess;
