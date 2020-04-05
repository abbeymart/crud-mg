/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-01-03 | @Updated: 2019-01-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/test | assertion function(s)
 */

// test handler function | preferred - elegant/flexible - for handling different/simple cases
function ok( expr, msg ) {
    if ( ! expr ) {
        throw new Error(msg);
    }
}
module.exports = ok;
