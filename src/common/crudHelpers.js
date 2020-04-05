/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-05 | @Updated: 2019-06-06
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud helper functions
 */

const {getResMessage}    = require('@mconnect/res-messages');

function checkDb(dbConnect) {
    if (!dbConnect || typeof dbConnect !== 'function') {
        return getResMessage('validateError', {
            message: 'valid database connection function/handler is required',
        });
    } else {
        return  false;
    }
}


module.exports = {checkDb};
