"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reactive = void 0;
class Work {
    constructor(handler) {
        this._handler = handler;
        this._dependencies = [];
    }
    dispatch(prop, computed) {
        this._handler(prop, computed);
    }
    resetDependencies() {
        this._dependencies.splice(0, this._dependencies.length);
    }
    declareDependency(dependency) {
        if (!~this._dependencies.indexOf(dependency)) {
            this._dependencies.push(dependency);
        }
    }
    getDependencies() {
        return this._dependencies.slice();
    }
    getHandler() {
        return this._handler;
    }
}
class ReversedDependencies {
    constructor() {
        this._structure = {};
    }
    get(path) {
        return this._recursiveGet(this._structure, path);
    }
    add(path, work) {
        this._recursiveAdd(this._structure, path, work);
    }
    _recursiveGet(structure, path) {
        if (!structure[path[0]])
            return [];
        if (path.length == 0) {
            return [];
        }
        else if (path.length == 1) {
            return structure[path[0]].works;
        }
        else {
            return this._recursiveGet(structure[path[0]].dependencies, path.slice(1));
        }
    }
    _recursiveAdd(structure, path, work) {
        if (path.length == 0)
            return;
        if (!structure[path[0]]) {
            structure[path[0]] = {
                works: [],
                dependencies: {}
            };
        }
        if (path.length == 1) {
            structure[path[0]].works.push(work);
        }
        else {
            this._recursiveAdd(structure[path[0]].dependencies, path.slice(1), work);
        }
    }
}
/**
 * PURPOSE
 * =======
 *
 * Reactive properties allow to reverse how properties are linked together.
 * Instead of using events to say
 *   "When A has changed, then update B"
 * reactive properties do it this way:
 *   "B depends on A"
 *
 * The Reactive will automatically re-build B when A is updated
 *
 *
 * TERMINOLOGY
 * ===========
 *
 * Prop:
 *   It is an object property that is constantly observed.
 *   When edited, every Works that make use of this Prop will be re-run
 *
 * Computed:
 *   Computed properties are built and updated automatically from Props.
 *   Each Computed relies on a function with no side effect that uses one or severals props to compute a new value
 *
 * Work:
 *   Functions with side effects. You can use a Work to update Props
 *   or do whatever you want. When a Prop used by a Work is modified, the Work will be re-run.
 *
 * Linker:
 *   Links a Select or an Input Element to an existing prop.
 *   Editing the prop will change the Element value.
 *   When the Element value changes, the prop value will also be changed.
 *
 *
 * EXAMPLE
 * =======
 *
 * ```
 *  let reactive = new Reactive({
 *    red: false,
 *    blue: false
 *  })
 *
 *  reactive.defineComputed(
 *    'multicolor',
 *    prop => {
 *      return prop.red && prop.blue
 *    }
 *  )
 *
 *  reactive.defineWork(
 *    (prop, computed) => {
 *      if (computed.multicolor) {
 *        console.log('RAINBOOOOW')
 *      }
 *    }
 *  )
 *
 *  reactive.prop.red = true
 *
 *  // Will display "RAINBOOOOW"
 *  reactive.prop.blue = true
 * ```
 */
class Reactive {
    constructor(props, computeds, verbose = false) {
        this.prop = {};
        this.computed = {};
        this._props = {};
        this._computeds = {};
        this._works = [];
        this._tickRunning = false;
        this._successiveStack = [];
        this._editedPropsDuringTick = [];
        this._editedPropsDuringWork = [];
        this._accessedPropsDuringWork = [];
        this._eventListeners = [];
        this._linkedPropInvalidations = {};
        this._verbose = verbose;
        if (props) {
            Object.keys(props).forEach((propName) => {
                const prop = props[propName];
                this.defineProp(propName, prop);
            });
        }
        if (computeds) {
            this.defineComputeds(computeds);
        }
    }
    /**
     * Define a new Prop.
     *
     * This Prop will be constantly observed. When this Prop is mutated, the
     * value of any Computed dependent of this Prop will be updated, and any
     * dependent Work will be re-run.
     *
     * This can be done one time per Prop only.
     */
    defineProp(propName, value) {
        if (typeof this._props[propName] !== 'undefined')
            throw new Error('Prop already defined');
        if (typeof propName == 'symbol')
            throw new Error("Prop can't be indexed with a symbol");
        const set = (value) => {
            if (this._isObject(value)) {
                this._props[propName] = this._createObjectProxy(value, (...args) => {
                    this._propAccessed(propName, ...args);
                }, (...args) => {
                    this._propEdited(propName, ...args);
                }, (...args) => {
                    this._propEdited(propName, ...args);
                });
            }
            else {
                this._props[propName] = value;
            }
        };
        set(value);
        Object.defineProperty(this.prop, propName, {
            get: () => {
                this._propAccessed(propName);
                return this._props[propName];
            },
            set: (newValue) => {
                if (this._props[propName] !== newValue) {
                    set(newValue);
                    this._propEdited(propName);
                }
                return this._props[propName];
            }
        });
    }
    /**
     * Define multiple new Props at once.
     *
     * @see {@link Reactive.defineProp}
     *
     * @example
     * reactive.defineProps({
     *   blue: true,
     *   yellow: true,
     *   white: false,
     *   palette: {
     *     currentColor: 'blue',
     *     selectedColors: ['yellow']
     *   }
     * })
     */
    defineProps(props) {
        Object.keys(props).forEach((propName) => {
            const prop = props[propName];
            this.defineProp(propName, prop);
        });
    }
    /**
     * Define a new Work.
     *
     * A Work is a function that is re-run everytime a Prop or a Computed it
     * accessed during its previous run has been mutated.
     *
     * A Work is designed to have side effects.
     *
     * A Prop can be edited within or outside a Work.
     */
    defineWork(handler) {
        if (this._verbose)
            this._log('╔════ DEFINE WORK ════╗');
        const work = new Work(handler);
        this._works.push(work);
        this._dispatchWork(work);
        if (this._verbose)
            this._log('╚════ DEFINE WORK ════╝');
    }
    /**
     * Define multiple Works at once.
     *
     * @see {@link Reactive.defineWork}
     *
     * @example
     * reactive.defineWorks([
     *   (prop, computed) => {
     *     // Print `prop.blue` value each time it is mutated
     *     console.log('Is blue:', prop.blue)
     *   }
     * ])
     */
    defineWorks(handlers) {
        handlers.forEach(handler => {
            this.defineWork(handler);
        });
    }
    /**
     * Define a new Computed.
     *
     * A Computed is defined with a function that makes use of Props and other
     * Computeds to create a new dynamic value.
     *
     * In the same manner as Works, the Computeds values are updated once the
     * related Props are mutated.
     */
    defineComputed(computedName, handler) {
        if (typeof this._computeds[computedName] !== 'undefined')
            throw new Error('Computed already defined');
        if (typeof handler !== 'function')
            throw new Error('The second parameter should be a function');
        if (this._verbose)
            this._log('╔════ DEFINE COMPUTED ════╗');
        const work = new Work((prop, computed) => {
            this._computeds[computedName] = handler(prop, computed);
        });
        this._works.push(work);
        Object.defineProperty(this.computed, computedName, {
            get: () => {
                const dependencies = work.getDependencies();
                const editedProps = this._editedPropsDuringTick;
                const needsUpdate = dependencies.filter(dependency => this._propPathExistsIn(dependency, editedProps));
                if (needsUpdate.length) {
                    work.dispatch(this.prop, this.computed);
                }
                // Trigger getters
                dependencies.forEach(dependency => {
                    void this._getDeep(this.prop, dependency);
                });
                return this._computeds[computedName];
            },
            set: () => {
                throw new Error('Setting a computed directly is not allowed');
            }
        });
        this._dispatchWork(work);
        if (this._verbose)
            this._log('╚════ DEFINE COMPUTED ════╝');
    }
    /**
     * Define multiple Computeds at once.
     *
     * @see {@link Reactive.defineComputed}
     *
     * @example
     * reactive.defineComputeds({
     *   green: prop => prop.blue && prop.yellow,
     *   lightGreen: (prop, computed) => prop.white && computed.green
     * })
     */
    defineComputeds(handlers) {
        Object.keys(handlers).forEach(computedName => {
            const handler = handlers[computedName];
            this.defineComputed(computedName, handlers[computedName]);
        });
    }
    /**
     * Links a Prop from another Reactive object to the current one.
     *
     * This Prop won't be mutable, but it can be accessed and will trigger
     * dependent Works.
     */
    defineSharedProp(sourceReactive, targetPropName, sourcePropName) {
        if (typeof this._props[targetPropName] !== 'undefined')
            throw new Error('Prop already defined');
        if (typeof targetPropName == 'symbol')
            throw new Error("Prop can't be indexed with a symbol");
        if (this._verbose)
            this._log('╔════ DEFINE EXTERNAL PROP ════╗');
        const work = new Work(() => {
            this._props[targetPropName] = sourceReactive.prop[sourcePropName];
        });
        sourceReactive._works.push(work);
        sourceReactive._linkPropInvalidation(this, sourcePropName, targetPropName);
        Object.defineProperty(this.prop, targetPropName, {
            get: () => {
                this._propAccessed(targetPropName);
                return this._props[targetPropName];
            },
            set: () => {
                throw new Error("This is an external prop, it can't be mutated directly");
            }
        });
        sourceReactive._dispatchWork(work);
        if (this._verbose)
            this._log('╚════ DEFINE EXTERNAL PROP ════╝');
    }
    /**
     * Define multiple shared Props at once.
     *
     * @see {@link Reactive.defineSharedProp}
     *
     * @example
     * // Reflects `eiffelTower.reactive.lightsOn`
     * // to `paris.reactive.towerLightsOn`
     * paris.reactive.defineSharedProps(eiffelTower.reactive, {
     *   lightsOn: 'towerLightsOn'
     *   lightsList: 'towerLightsList'
     * })
     */
    defineSharedProps(sourceReactive, map) {
        Object.keys(map).forEach(sourcePropName => {
            const targetPropName = map[sourcePropName];
            this.defineSharedProp(sourceReactive, targetPropName, sourcePropName);
        });
    }
    /**
     * Links a Select or an Input Element to an existing Prop.
     *
     * Editing the Prop will change the Element value.
     *
     * When the Element value changes, the Prop value will also be changed.
     */
    defineFormProp(propName, element, accessors) {
        var _a;
        const getElementValue = (_a = accessors === null || accessors === void 0 ? void 0 : accessors.getter) !== null && _a !== void 0 ? _a : ((element) => {
            if (element instanceof HTMLInputElement && element.getAttribute('type') == 'checkbox') {
                return element.checked;
            }
            else if (element instanceof HTMLSelectElement && element.getAttribute('multiple')) {
                return Array.from(element.selectedOptions).map(option => option.value);
            }
            else {
                return element.value;
            }
        });
        if (!Object.prototype.hasOwnProperty.call(this._props, propName)) {
            this.defineProp(propName, getElementValue(element));
        }
        // Element => prop
        const handler = () => {
            if (element.checkValidity()) {
                this.prop[propName] = getElementValue(element);
            }
        };
        const eventsNames = ['INPUT', 'TEXTAREA'].includes(element.tagName) ? ['input', 'change'] : ['change'];
        eventsNames.forEach(eventName => {
            element.addEventListener(eventName, handler);
            this._eventListeners.push({
                element: element,
                eventName: eventName,
                handler: handler
            });
        });
        // Prop => element
        this.defineWork(() => {
            if (accessors === null || accessors === void 0 ? void 0 : accessors.setter) {
                accessors.setter(element, this.prop[propName]);
            }
            else {
                if (element instanceof HTMLInputElement && element.getAttribute('type') == 'checkbox') {
                    element.checked = !!this.prop[propName];
                }
                else {
                    element.value = this.prop[propName] === null ? '' : '' + this.prop[propName];
                }
            }
        });
    }
    /**
     * Define multiple Form Links at once.
     *
     * @see {@link Reactive.defineFormProp}
     *
     * @example
     * reactive.defineFormProps({
     *   color: {
     *     element: document.querySelector('select'),
     *     elementSetter: (element, value) => element.customSetter(value)
     *   }
     * })
     */
    defineFormProps(formLinks) {
        Object.keys(formLinks).forEach(propName => {
            this.defineFormProp(propName, formLinks[propName].element, formLinks[propName].accessors);
        });
    }
    /**
     * Will mark a Prop as edited, without having to actually edit the Prop.
     */
    touch(propPath) {
        if (typeof propPath == 'string' || typeof propPath == 'number' || typeof propPath == 'symbol')
            this._propEdited(propPath);
        else
            this._propEdited(...propPath);
    }
    /**
     * Will clean the references of the object to prevent memory leaks.
     */
    destroy() {
        Object.keys(this.prop).forEach(key => delete this.prop[key]);
        Object.keys(this._props).forEach(key => delete this._props[key]);
        this._works.splice(0, this._works.length);
        this._successiveStack.splice(0, this._successiveStack.length);
        this._editedPropsDuringTick.splice(0, this._editedPropsDuringTick.length);
        this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length);
        this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length);
        this._eventListeners.forEach(eventListener => {
            eventListener.element.removeEventListener(eventListener.eventName, eventListener.handler);
        });
    }
    /**
     * Will convert the object into a Proxy recursively to allow listening for
     * changes.
     * @param source The object to convert
     * @param getter Function to call when a property is accessed
     * @param setter Function to call when a property is mutated
     * @param deletter Function to call when a property is deleted
     * @param parents A Map containing the objects already converted in the call
     *  stack. Is used to prevent infinite loops.
     * @returns Returns a Proxy of the source object
     */
    _createObjectProxy(source, getter, setter, deletter, parents = new Map()) {
        if (parents.has(source)) {
            return parents.get(source);
        }
        else if (Object.getPrototypeOf(source) !== Object.prototype &&
            !Array.isArray(source)) {
            // If the object is an instance of a class, and not a litteral object
            return source;
        }
        else {
            const local = Array.isArray(source) ? [] : {};
            const setProperty = (obj, key, value) => {
                if (this._isObject(value)) {
                    obj[key] = this._createObjectProxy(value, getter.bind(this, key), setter.bind(this, key), deletter.bind(this, key), currentPath);
                }
                else {
                    obj[key] = value;
                }
            };
            const proxyHandler = {
                get: (obj, key) => {
                    if (Object.prototype.hasOwnProperty.call(obj, key))
                        getter(key);
                    return obj[key];
                },
                set: (obj, key, value) => {
                    if (value !== obj[key]) {
                        const newlyDefined = !Object.hasOwnProperty.call(obj, key);
                        setProperty(obj, key, value);
                        if (newlyDefined)
                            setter();
                        else
                            setter(key);
                    }
                    return true;
                },
                deleteProperty: (obj, key) => {
                    delete obj[key];
                    deletter(key);
                    return true;
                }
            };
            const proxy = new Proxy(local, proxyHandler);
            const currentPath = new Map(parents);
            currentPath.set(source, proxy);
            Object.keys(source).forEach(key => {
                const value = source[key];
                setProperty(local, key, value);
            });
            return proxy;
        }
    }
    /**
     * Handles prop invalidation.
     *
     * If `path.to.a` is edited, Works that are dependent of the following
     * props will be re-run:
     * - `path.to.a`
     * - `path.to.a.*`
     *
     * However, these Works won't be re-run:
     * - `path.to.b`
     * - `path.to`
     */
    _propEdited(...propPath) {
        var _a;
        if (this._verbose)
            this._log(`${propPath} edited to ${this._getDeep(this._props, propPath)}`);
        if (!this._propPathExistsIn(propPath, this._editedPropsDuringTick)) {
            this._editedPropsDuringTick.push(propPath);
        }
        if (!this._propPathExistsIn(propPath, this._editedPropsDuringWork)) {
            this._editedPropsDuringWork.push(propPath);
        }
        if (!this._tickRunning)
            this._dispatchWorks();
        (_a = this._linkedPropInvalidations[propPath[0]]) === null || _a === void 0 ? void 0 : _a.forEach(linked => {
            linked.targetReactive._propEdited(linked.targetPropName, ...propPath.slice(1));
        });
    }
    /**
     * When a Work is accessing a prop, it will be marked as dependent of it.
     *
     * If a Work is accessing `path.to.a`, it will be dependent of:
     * - `path`
     * - `path.to`
     * - `path.to.a`
     */
    _propAccessed(...propPath) {
        var _a;
        if (!this._propPathExistsIn(propPath, this._accessedPropsDuringWork)) {
            this._accessedPropsDuringWork.push(propPath);
        }
        (_a = this._linkedPropInvalidations[propPath[0]]) === null || _a === void 0 ? void 0 : _a.forEach(linked => {
            linked.targetReactive._propAccessed(linked.targetPropName, ...propPath.slice(1));
        });
    }
    /**
     * Declare that, when a Prop is invalidated, it should also invalidate
     * another Prop from another Reactive.
     */
    _linkPropInvalidation(targetReactive, sourcePropName, targetPropName) {
        var _a;
        var _b;
        (_b = this._linkedPropInvalidations)[sourcePropName] || (_b[sourcePropName] = []);
        (_a = this._linkedPropInvalidations[sourcePropName]) === null || _a === void 0 ? void 0 : _a.push({
            targetReactive: targetReactive,
            targetPropName: targetPropName
        });
    }
    /**
     * Runs a full Tick that will run all Works that are invalidated.
     */
    _dispatchWorks() {
        this._tickRunning = true;
        const invalidatedProps = this._editedPropsDuringTick.splice(0, this._editedPropsDuringTick.length);
        Object.freeze(invalidatedProps);
        const reversedDependencies = this._getReversedWorksDependencies();
        if (this._verbose) {
            this._log('╔════ TICK ════╗');
            this._log('Invalidated props (edited before tick)', invalidatedProps);
            this._log('Reversed dependencies', reversedDependencies);
        }
        if (this._checkLoopInStack()) {
            throw new Error('Infinite loop detected');
        }
        invalidatedProps.forEach(propPath => {
            const dependentWorks = reversedDependencies.get(propPath);
            if (dependentWorks) {
                dependentWorks.forEach(work => {
                    this._dispatchWork(work);
                });
            }
        });
        if (this._verbose) {
            this._log('╚════ TICK ════╝');
        }
        this._tickRunning = false;
        if (this._editedPropsDuringTick.length)
            this._dispatchWorks();
        else
            this._successiveStack.splice(0, this._successiveStack.length);
    }
    /**
     * Dispatch the Work and find its dependencies
     * @param invalidatedProps When called from a tick, all props invalidated
     *  during this tick are forwarded
     */
    _dispatchWork(work) {
        if (this._verbose) {
            this._log('════ Dispatch work ════');
            this._log('\n', work.getHandler());
        }
        this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length);
        this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length);
        work.dispatch(this.prop, this.computed);
        const accessedProps = this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length);
        const editedProps = this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length);
        // A Work cannot be dependent of a property edited by itself
        const dependencies = accessedProps.filter(propPath => !this._propPathExistsIn(propPath, editedProps));
        if (this._verbose) {
            this._log('Accessed', accessedProps);
            this._log('Edited', editedProps);
            this._log('Dependencies (accessed without edited)', dependencies);
        }
        // Replace rependencies
        work.resetDependencies();
        dependencies.forEach(dependency => work.declareDependency(dependency));
        this._successiveStack.push(work);
    }
    _getReversedWorksDependencies() {
        const dependencies = new ReversedDependencies();
        this._works.forEach(work => {
            const workDependencies = work.getDependencies();
            workDependencies.forEach(dependency => {
                dependencies.add(dependency, work);
            });
        });
        return dependencies;
    }
    _checkLoopInStack() {
        const workList = [];
        const workCount = {};
        this._successiveStack.forEach(work => {
            let index = workList.indexOf(work);
            if (!~index) {
                workList.push(work);
                index = workList.length - 1;
                workCount[index] = 0;
            }
            workCount[index]++;
        });
        let maxCount = 0;
        Object.keys(workCount).forEach(index => {
            if (workCount[parseInt(index)] > maxCount)
                maxCount = workCount[parseInt(index)];
        });
        return maxCount > 20;
    }
    _isObject(value) {
        return typeof value === 'object' && value !== null;
    }
    _getDeep(obj, keys) {
        if (keys.length == 1)
            return obj[keys[0]];
        else {
            const next = obj[keys[0]];
            if (this._isObject(next))
                return this._getDeep(next, keys.slice(1));
        }
    }
    _propPathExistsIn(needle, haystack) {
        let exists = false;
        for (let i = 0; i < haystack.length; i++) {
            const item = haystack[i];
            if (needle.length == item.length) {
                let arraysAreEqual = true;
                for (let j = 0; j < needle.length; j++) {
                    if (needle[j] !== item[j]) {
                        arraysAreEqual = false;
                        break;
                    }
                }
                if (arraysAreEqual) {
                    exists = true;
                    break;
                }
            }
        }
        return exists;
    }
    _log(...args) {
        const zeros = (n, length = 2) => {
            const nStr = n.toString();
            return '0'.repeat(Math.max(0, length - nStr.length)) + nStr;
        };
        const now = new Date();
        const nowString = '[' +
            zeros(now.getHours()) +
            ':' +
            zeros(now.getMinutes()) +
            ':' +
            zeros(now.getSeconds()) +
            '.' +
            zeros(now.getMilliseconds(), 3) +
            ']';
        console.log.bind(this, nowString).apply(this, args);
    }
}
exports.Reactive = Reactive;
