/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-01-12 | @Updated: 2019-06-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/auth, role-by-services assignment => servicesIds & accessLevels[]
 */

const {getParamsMessage} = require('@mconnect/utils')();

async function roleAssignedServices(dbConnect, userGroup, roleColl = 'roles') {
    // validate
    let errorsParams = {};
    if (!dbConnect || typeof dbConnect !== 'function') {
        errorsParams.dbConnect = 'valid db-connection handler (of type function) is required';
    }
    if (!roleColl) {
        errorsParams.accessColl = 'role collection name is required';
    }
    if (!userGroup) {
        errorsParams.userColl = 'user-group reference/id is required';
    }
    if (Object.keys(errorsParams).length > 0) {
        return getParamsMessage(errorsParams);
    }

    // Get permitted services (ids) from Roles collection
    let roleServices = [],
        db, col, result;
    try {
        // use / activate database
        db  = await dbConnect();
        col = db.collection(roleColl);

        result = await col.find({
            group   : userGroup,
            isActive: true
        }).toArray();

        if (result.length > 0) {
            await result.forEach((item) => {
                roleServices.push({
                    service  : item.service,
                    group    : item.group,
                    category : item.category,
                    canRead  : item.canRead,
                    canCreate: item.canCreate,
                    canUpdate: item.canUpdate,
                    canDelete: item.canDelete
                });
            });
        }
        return roleServices;
    } catch (error) {
        console.error('Error getting role-services records: ', error.stack);
        return roleServices;
    }
}

module.exports = roleAssignedServices;
