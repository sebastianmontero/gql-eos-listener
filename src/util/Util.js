

class Util {
    static isEmptyObj(obj) {
        for (var key in obj) {
            if (obj.hasOwnProperty(key))
                return false;
        }
        return true;
    }

    static _wasFound(str, chars, pos, not = false) {
        let foundChar = chars.indexOf(str.charAt(pos)) > -1;
        return ((foundChar && !not) || (!foundChar && not));
    }

    static indexOf(str, chars, pos, not = false) {
        for (let i = pos; i < str.length; i++) {
            if (this._wasFound(str, chars, i, not)) {
                return i;
            }
        }
        return -1;
    }

    static lastIndexOf(str, chars, pos, not = false) {
        for (let i = pos; i >= 0; i--) {
            if (this._wasFound(str, chars, i, not)) {
                return i;
            }
        }
        return -1;
    }

    static modifiedProps(oldObj, newObj, props) {
        const mod = {};
        props = props || Object.keys(oldObj);
        for (let prop of props) {
            if (!Util.areEqual(oldObj[prop], newObj[prop])) {
                mod[prop] = true;
            }
        }
        return Util.isEmptyObj(mod) ? null : mod;
    }

    static toKeyValue(objs, key, value) {
        let keyValue = {};
        for (let obj of objs) {
            keyValue[obj[key]] = obj[value];
        }
        return keyValue;
    }

    static areArraysEqual(a1, a2) {
        return a1.length == a2.length && !a1.some((v) => a2.indexOf(v) < 0);
    }

    static cloneArray(a) {
        return a.slice(0);
    }

    static isString(value) {
        return typeof value == 'string';
    }

    static isObject(value) {
        return Object.prototype.toString.call(value) === '[object Object]';
    }

    static areEqual(v1, v2) {
        // Get the value type
        var type = Object.prototype.toString.call(v1);

        // If the two objects are not the same type, return false
        if (type !== Object.prototype.toString.call(v2)) return false;

        // If items are not an object or array, return false
        if (['[object Array]', '[object Object]'].indexOf(type) < 0) {
            return v1 === v2;
        }

        // Compare the length of the length of the two items
        var valueLen = type === '[object Array]' ? v1.length : Object.keys(v1).length;
        var otherLen = type === '[object Array]' ? v2.length : Object.keys(v2).length;
        if (valueLen !== otherLen) return false;

        // Compare two items
        var compare = function (item1, item2) {

            // Get the object type
            var itemType = Object.prototype.toString.call(item1);

            // If an object or array, compare recursively
            if (['[object Array]', '[object Object]'].indexOf(itemType) >= 0) {
                if (!Util.areEqual(item1, item2)) return false;
            }

            // Otherwise, do a simple comparison
            else {

                // If the two items are not the same type, return false
                if (itemType !== Object.prototype.toString.call(item2)) return false;

                // Else if it's a function, convert to a string and compare
                // Otherwise, just compare
                if (itemType === '[object Function]') {
                    if (item1.toString() !== item2.toString()) return false;
                } else {
                    if (item1 !== item2) return false;
                }

            }
        };

        // Compare properties
        if (type === '[object Array]') {
            for (var i = 0; i < valueLen; i++) {
                if (compare(v1[i], v2[i]) === false) return false;
            }
        } else {
            for (var key in v1) {
                if (v1.hasOwnProperty(key)) {
                    if (compare(v1[key], v2[key]) === false) return false;
                }
            }
        }

        // If nothing failed, return true
        return true;
    }
}

module.exports = Util;