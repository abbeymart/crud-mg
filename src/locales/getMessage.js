/**
 * @Author: abbeymart | Abi Akindele | @Created: 2019-06-02 | @Updated: 2019-06-02
 * @Company: mConnect.biz | @License: MIT
 * @Description: locales - messages
 */

// Import utility function(s)
const utils = require("@mconnect/utils")();

// const data sources
const enUSMessages = require("./locales/json/messages/enUSMessages");
const enCAMessages = require("./locales/json/messages/enCAMessages");
const frCAMessages = require("./locales/json/messages/frCAMessages");
const frFRMessages = require("./locales/json/messages/frFRMessages");

// Get current user default language setting
const currentLang = utils.getLanguage();

const localeFiles = {
    'en-US': enUSMessages,
    'en-CA': enCAMessages,
    'fr-CA': frCAMessages,
    'fr-FR': frFRMessages,
};

const mcMessages = utils.getLocale(localeFiles, {
    language: currentLang,
    type    : 'messages',
});

module.exports = {mcMessages};
