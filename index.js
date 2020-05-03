/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-01-10 | @Updated: 2020-05-03
 * @Company: mConnect.biz | @License: MIT
 * @Description: @mconnect/crud-mongo, mongoDB CRUD operations
 */

const {GetAllRecord, newGetAllRecord}             = require('./src/GetAllRecord'),
      {GetAllRecordStream, newGetAllRecordStream} = require('./src/GetAllRecordStream'),
      {GetRecord, newGetRecord}                   = require('./src/GetRecord'),
      {GetRecordStream, newGetRecordStream}       = require('./src/GetRecordStream'),
      {SaveRecord, newSaveRecord}                 = require('./src/SaveRecord'),
      {DeleteRecord, newDeleteRecord}             = require('./src/DeleteRecord');

module.exports = {
    GetAllRecord,
    newGetAllRecord,
    GetAllRecordStream,
    newGetAllRecordStream,
    GetRecord,
    newGetRecord,
    GetRecordStream,
    newGetRecordStream,
    SaveRecord,
    newSaveRecord,
    DeleteRecord,
    newDeleteRecord,
};
