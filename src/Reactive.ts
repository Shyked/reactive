type IfEquals<T, U, Y=unknown, N=never> =
  (<G>() => G extends T ? 1 : 2) extends
  (<G>() => G extends U ? 1 : 2) ? Y : N;

type PropValue = unknown
type PropName = string | number | symbol

interface Props {
  [key: PropName]: PropValue
}

type ComputedName = string | number | symbol
type ComputedValue = unknown

interface Computeds {
  [key: ComputedName]: ComputedValue
}

type PropPath = PropName[]

type WorkHandler<CustomProps extends Props, CustomComputeds extends Computeds, Return> = (
  prop: CustomProps,
  computed: CustomComputeds,
  invalidatedProps?: PropPath[]
) => Return

interface EventListener {
  element: HTMLElement,
  eventName: string,
  handler: (...args: unknown[]) => void
}

class Work<CustomProps extends Props, CustomComputeds extends Computeds, Return = void> {
  private _handler: WorkHandler<CustomProps, CustomComputeds, Return>
  private _dependencies: PropPath[]

  constructor (handler: WorkHandler<CustomProps, CustomComputeds, Return>) {
    this._handler = handler
    this._dependencies = []
  }

  dispatch (prop: CustomProps, computed: CustomComputeds): void {
    this._handler(prop, computed)
  }

  resetDependencies (): void {
    this._dependencies.splice(0, this._dependencies.length)
  }

  declareDependency (dependency: PropPath): void {
    if (!~this._dependencies.indexOf(dependency)) {
      this._dependencies.push(dependency)
    }
  }

  getDependencies (): PropPath[] {
    return this._dependencies.slice()
  }

  getHandler (): WorkHandler<CustomProps, CustomComputeds, Return> {
    return this._handler
  }
}

type ReversedDependenciesStructure<CustomProps extends Props, CustomComputeds extends Computeds> = Record<
  PropName,
  {
    works: Work<CustomProps, CustomComputeds, void>[],
    dependencies: ReversedDependenciesStructure<CustomProps, CustomComputeds>
  }
>

class ReversedDependencies<CustomProps extends Props, CustomComputeds extends Computeds> {
  private _structure: ReversedDependenciesStructure<CustomProps, CustomComputeds> = { }

  get (path: PropPath): Work<CustomProps, CustomComputeds, void>[] {
    return this._recursiveGet(this._structure, path)
  }

  add (path: PropPath, work: Work<CustomProps, CustomComputeds, void>): void {
    this._recursiveAdd(this._structure, path, work)
  }

  private _recursiveGet (
    structure: ReversedDependenciesStructure<CustomProps, CustomComputeds>,
    path: PropPath
  ): Work<CustomProps, CustomComputeds, void>[] {
    if (!structure[path[0]]) return []
    if (path.length == 0) {
      return []
    } else if (path.length == 1) {
      return structure[path[0]].works
    } else {
      return this._recursiveGet(structure[path[0]].dependencies, path.slice(1))
    }
  }

  private _recursiveAdd (
    structure: ReversedDependenciesStructure<CustomProps, CustomComputeds>,
    path: PropPath,
    work: Work<CustomProps, CustomComputeds, void>
  ): void {
    if (path.length == 0) return
    if (!structure[path[0]]) {
      structure[path[0]] = {
        works: [],
        dependencies: { }
      }
    }
    if (path.length == 1) {
      structure[path[0]].works.push(work)
    } else {
      this._recursiveAdd(structure[path[0]].dependencies, path.slice(1), work)
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
export class Reactive<CustomProps extends Props = Props, CustomComputeds extends Computeds = Computeds> {
  public prop: CustomProps = { } as CustomProps
  public computed: CustomComputeds = { } as CustomComputeds
  private _props: Partial<CustomProps> = { }
  private _computeds: Partial<CustomComputeds> = { }
  private _works: Work<CustomProps, CustomComputeds, void>[] = []
  private _tickRunning = false
  private _successiveStack: Work<CustomProps, CustomComputeds, void>[] = []
  private _editedPropsDuringTick: PropPath[] = []
  private _editedPropsDuringWork: PropPath[] = []
  private _accessedPropsDuringWork: PropPath[] = []
  private _eventListeners: EventListener[] = []
  private _verbose: boolean

  private _linkedPropInvalidations: Partial<Record<keyof CustomProps, {
    targetReactive: Reactive<Partial<Props>, Partial<Computeds>>,
    targetPropName: PropName
  }[]>> = {}

  constructor (
    props?: Partial<CustomProps>,
    computeds?: Partial<{
      [key in keyof CustomComputeds]: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[key]>
    }>,
    verbose = false
  ) {
    this._verbose = verbose

    if (props) {
      Object.keys(props).forEach((propName: keyof CustomProps) => {
        const prop = props[propName]
        this.defineProp(propName, prop as NonNullable<typeof prop>)
      })
    }

    if (computeds) {
      this.defineComputeds(computeds)
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
  defineProp<T extends keyof CustomProps> (propName: T, value: CustomProps[T]): void {
    if (typeof this._props[propName] !== 'undefined') throw new Error('Prop already defined')
    if (typeof propName == 'symbol') throw new Error("Prop can't be indexed with a symbol")

    const set = (value: CustomProps[T]) => {
      if (this._isObject(value)) {
        this._props[propName] = this._createObjectProxy(
          value,
          (...args: PropPath) => {
            this._propAccessed(propName, ...args)
          },
          (...args: PropPath) => {
            this._propEdited(propName, ...args)
          },
          (...args: PropPath) => {
            this._propEdited(propName, ...args)
          }
        )
      } else {
        this._props[propName] = value
      }
    }

    set(value)

    Object.defineProperty(this.prop, propName, {
      get: () => {
        this._propAccessed(propName)
        return this._props[propName]
      },
      set: (newValue: CustomProps[T]) => {
        if (this._props[propName] !== newValue) {
          set(newValue)
          this._propEdited(propName)
        }
        return this._props[propName]
      }
    })
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
  defineProps (props: Partial<CustomProps>): void {
    Object.keys(props).forEach((propName: keyof CustomProps) => {
      const prop = props[propName]
      this.defineProp(propName, prop as NonNullable<typeof prop>)
    })
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
  defineWork (handler: WorkHandler<CustomProps, CustomComputeds, void>): void {
    if (this._verbose) this._log('╔════ DEFINE WORK ════╗')
    const work = new Work(handler)
    this._works.push(work)
    this._dispatchWork(work)
    if (this._verbose) this._log('╚════ DEFINE WORK ════╝')
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
  defineWorks (handlers: WorkHandler<CustomProps, CustomComputeds, void>[]): void {
    handlers.forEach(handler => {
      this.defineWork(handler)
    })
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
  defineComputed<T extends keyof CustomComputeds> (
    computedName: T,
    handler: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[T]>
  ): void {
    if (typeof this._computeds[computedName] !== 'undefined') throw new Error('Computed already defined')
    if (typeof handler !== 'function') throw new Error('The second parameter should be a function')
    if (this._verbose) this._log('╔════ DEFINE COMPUTED ════╗')
    const work = new Work<CustomProps, CustomComputeds, void>((prop, computed) => {
      this._computeds[computedName] = handler(prop, computed)
    })
    this._works.push(work)
    Object.defineProperty(this.computed, computedName, {
      get: () => {
        const dependencies = work.getDependencies()
        const editedProps = this._editedPropsDuringTick
        const needsUpdate = dependencies.filter(
          dependency => this._propPathExistsIn(dependency, editedProps)
        )
        if (needsUpdate.length) {
          work.dispatch(this.prop, this.computed)
        }
        // Trigger getters
        dependencies.forEach(dependency => {
          void this._getDeep(this.prop, dependency)
        })
        return this._computeds[computedName]
      },
      set: () => {
        throw new Error('Setting a computed directly is not allowed')
      }
    })
    this._dispatchWork(work)
    if (this._verbose) this._log('╚════ DEFINE COMPUTED ════╝')
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
  defineComputeds (handlers: Partial<{
    [key in keyof CustomComputeds]: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[key]>
  }>): void {
    Object.keys(handlers).forEach(computedName => {
      const handler = handlers[computedName]
      this.defineComputed(computedName, handlers[computedName] as NonNullable<typeof handler>)
    })
  }

  /**
   * Links a Prop from another Reactive object to the current one.
   *
   * This Prop won't be mutable, but it can be accessed and will trigger
   * dependent Works.
   */
  defineSharedProp<SourceProps extends Props, SourceComputeds extends Computeds, U extends IfEquals<CustomProps[keyof CustomProps], SourceProps[keyof SourceProps], CustomProps[keyof CustomProps], never>> (
    sourceReactive: Reactive<SourceProps, SourceComputeds>,
    targetPropName: keyof CustomProps,
    sourcePropName: keyof SourceProps
  ): void {
    if (typeof this._props[targetPropName] !== 'undefined') throw new Error('Prop already defined')
    if (typeof targetPropName == 'symbol') throw new Error("Prop can't be indexed with a symbol")
    if (this._verbose) this._log('╔════ DEFINE EXTERNAL PROP ════╗')
    const work = new Work<SourceProps, SourceComputeds, void>(() => {
      this._props[targetPropName] = sourceReactive.prop[sourcePropName] as U
    })
    sourceReactive._works.push(work)
    sourceReactive._linkPropInvalidation(this, sourcePropName, targetPropName)
    Object.defineProperty(this.prop, targetPropName, {
      get: () => {
        this._propAccessed(targetPropName)
        return this._props[targetPropName]
      },
      set: () => {
        throw new Error("This is an external prop, it can't be mutated directly")
      }
    })
    sourceReactive._dispatchWork(work)
    if (this._verbose) this._log('╚════ DEFINE EXTERNAL PROP ════╝')
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
  defineSharedProps<SourceProps extends Props, SourceComputeds extends Computeds> (
    sourceReactive: Reactive<SourceProps, SourceComputeds>,
    map: Partial<Record<keyof SourceProps, keyof CustomProps>>
  ): void {
    Object.keys(map).forEach(sourcePropName => {
      const targetPropName = map[sourcePropName]
      this.defineSharedProp(sourceReactive, targetPropName as NonNullable<typeof targetPropName>, sourcePropName)
    })
  }

  /**
   * Links a Select or an Input Element to an existing Prop.
   *
   * Editing the Prop will change the Element value.
   *
   * When the Element value changes, the Prop value will also be changed.
   */
  defineFormProp (
    propName: keyof CustomProps,
    element: HTMLInputElement | HTMLSelectElement,
    accessors?: {
      setter?: (element: HTMLInputElement | HTMLSelectElement, value: PropValue) => void
      getter?: (element: HTMLInputElement | HTMLSelectElement) => PropValue
    }
  ): void {
    const getElementValue = accessors?.getter ?? ((element: HTMLInputElement | HTMLSelectElement) => {
      if (element instanceof HTMLInputElement && element.getAttribute('type') == 'checkbox') {
        return element.checked
      } else if (element instanceof HTMLSelectElement && element.getAttribute('multiple')) {
        return Array.from(element.selectedOptions).map(option => option.value)
      } else {
        return element.value
      }
    })
    if (!Object.prototype.hasOwnProperty.call(this._props, propName)) {
      this.defineProp(propName, getElementValue(element) as CustomProps[keyof CustomProps])
    }

    // Element => prop
    const handler = () => {
      if (element.checkValidity()) {
        this.prop[propName] = getElementValue(element) as CustomProps[keyof CustomProps]
      }
    }
    const eventsNames = ['INPUT', 'TEXTAREA'].includes(element.tagName) ? ['input', 'change'] : ['change']
    eventsNames.forEach(eventName => {
      element.addEventListener(eventName, handler)
      this._eventListeners.push({
        element: element,
        eventName: eventName,
        handler: handler
      })
    })

    // Prop => element
    this.defineWork(() => {
      if (accessors?.setter) {
        accessors.setter(element, this.prop[propName])
      } else {
        if (element instanceof HTMLInputElement && element.getAttribute('type') == 'checkbox') {
          element.checked = !!this.prop[propName]
        } else {
          element.value = this.prop[propName] === null ? '' : '' + this.prop[propName]
        }
      }
    })
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
  defineFormProps (
    formLinks: {
      [key in keyof Partial<CustomProps>]: {
        element: HTMLInputElement | HTMLSelectElement,
        accessors?: {
          setter?: (element: HTMLInputElement | HTMLSelectElement, value: PropValue) => void
          getter?: (element: HTMLInputElement | HTMLSelectElement) => PropValue
        }
      }
    }
  ): void {
    Object.keys(formLinks).forEach(propName => {
      this.defineFormProp(propName, formLinks[propName].element, formLinks[propName].accessors)
    })
  }

  /**
   * Will mark a Prop as edited, without having to actually edit the Prop.
   */
  touch (propPath: PropName | PropPath): void {
    if (typeof propPath == 'string' || typeof propPath == 'number' || typeof propPath == 'symbol') this._propEdited(propPath)
    else this._propEdited(...propPath)
  }

  /**
   * Will clean the references of the object to prevent memory leaks.
   */
  destroy (): void {
    Object.keys(this.prop).forEach(key => delete this.prop[key])

    Object.keys(this._props).forEach(key => delete this._props[key])
    this._works.splice(0, this._works.length)
    this._successiveStack.splice(0, this._successiveStack.length)
    this._editedPropsDuringTick.splice(0, this._editedPropsDuringTick.length)
    this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length)
    this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length)
    this._eventListeners.forEach(eventListener => {
      eventListener.element.removeEventListener(eventListener.eventName, eventListener.handler)
    })
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
  private _createObjectProxy<T extends Record<string, unknown>> (
    source: T,
    getter: (...args: PropPath) => void,
    setter: (...args: PropPath) => void,
    deletter: (...args: PropPath) => void,
    parents: Map<unknown, unknown> = new Map()
  ): T {
    if (parents.has(source)) {
      return parents.get(source) as T
    } else if (
      Object.getPrototypeOf(source) !== Object.prototype &&
      !Array.isArray(source)
    ) {
      // If the object is an instance of a class, and not a litteral object
      return source
    } else {
      const local = Array.isArray(source) ? [] : { }
      const setProperty = (obj: Record<string, unknown>, key: string, value: unknown) => {
        if (this._isObject(value)) {
          obj[key] = this._createObjectProxy(
            value,
            getter.bind(this, key),
            setter.bind(this, key),
            deletter.bind(this, key),
            currentPath
          )
        } else {
          obj[key] = value
        }
      }
      const proxyHandler: ProxyHandler<T> = {
        get: (obj, key: string) => {
          if (Object.prototype.hasOwnProperty.call(obj, key)) getter(key)
          return obj[key]
        },
        set: (obj, key: string, value) => {
          if (value !== obj[key]) {
            const newlyDefined = !Object.hasOwnProperty.call(obj, key)
            setProperty(obj, key, value)
            if (newlyDefined) setter()
            else setter(key)
          }
          return true
        },
        deleteProperty: (obj, key: string) => {
          delete obj[key]
          deletter(key)
          return true
        }
      }
      const proxy = new Proxy(local, proxyHandler)
      const currentPath = new Map<unknown, unknown>(parents)
      currentPath.set(source, proxy)
      Object.keys(source).forEach(key => {
        const value = source[key]
        setProperty(local, key, value)
      })
      return proxy as T
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
  private _propEdited (...propPath: PropPath): void {
    if (this._verbose) this._log(`${propPath} edited to ${this._getDeep(this._props, propPath)}`)
    if (!this._propPathExistsIn(propPath, this._editedPropsDuringTick)) {
      this._editedPropsDuringTick.push(propPath)
    }
    if (!this._propPathExistsIn(propPath, this._editedPropsDuringWork)) {
      this._editedPropsDuringWork.push(propPath)
    }

    if (!this._tickRunning) this._dispatchWorks()

    this._linkedPropInvalidations[propPath[0]]?.forEach(linked => {
      linked.targetReactive._propEdited(linked.targetPropName, ...propPath.slice(1))
    })
  }

  /**
   * When a Work is accessing a prop, it will be marked as dependent of it.
   *
   * If a Work is accessing `path.to.a`, it will be dependent of:
   * - `path`
   * - `path.to`
   * - `path.to.a`
   */
  private _propAccessed (...propPath: PropPath): void {
    if (!this._propPathExistsIn(propPath, this._accessedPropsDuringWork)) {
      this._accessedPropsDuringWork.push(propPath)
    }

    this._linkedPropInvalidations[propPath[0]]?.forEach(linked => {
      linked.targetReactive._propAccessed(linked.targetPropName, ...propPath.slice(1))
    })
  }

  /**
   * Declare that, when a Prop is invalidated, it should also invalidate
   * another Prop from another Reactive.
   */
  private _linkPropInvalidation<TargetProps extends Props, TargetComputeds extends Computeds> (
    targetReactive: Reactive<TargetProps, TargetComputeds>,
    sourcePropName: keyof CustomProps,
    targetPropName: keyof TargetProps
  ): void {
    this._linkedPropInvalidations[sourcePropName] ||= []
    this._linkedPropInvalidations[sourcePropName]?.push({
      targetReactive: targetReactive as unknown as Reactive<Props, Computeds>,
      targetPropName: targetPropName
    })
  }

  /**
   * Runs a full Tick that will run all Works that are invalidated.
   */
  private _dispatchWorks (): void {
    this._tickRunning = true
    const invalidatedProps = this._editedPropsDuringTick.splice(0, this._editedPropsDuringTick.length)
    Object.freeze(invalidatedProps)
    const reversedDependencies = this._getReversedWorksDependencies()
    if (this._verbose) {
      this._log('╔════ TICK ════╗')
      this._log('Invalidated props (edited before tick)', invalidatedProps)
      this._log('Reversed dependencies', reversedDependencies)
    }
    if (this._checkLoopInStack()) {
      throw new Error('Infinite loop detected')
    }
    invalidatedProps.forEach(propPath => {
      const dependentWorks = reversedDependencies.get(propPath)
      if (dependentWorks) {
        dependentWorks.forEach(work => {
          this._dispatchWork(work)
        })
      }
    })
    if (this._verbose) {
      this._log('╚════ TICK ════╝')
    }
    this._tickRunning = false
    if (this._editedPropsDuringTick.length) this._dispatchWorks()
    else this._successiveStack.splice(0, this._successiveStack.length)
  }

  /**
   * Dispatch the Work and find its dependencies
   * @param invalidatedProps When called from a tick, all props invalidated
   *  during this tick are forwarded
   */
  private _dispatchWork (work: Work<CustomProps, CustomComputeds, void>): void {
    if (this._verbose) {
      this._log('════ Dispatch work ════')
      this._log('\n', work.getHandler())
    }
    this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length)
    this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length)

    work.dispatch(this.prop, this.computed)

    const accessedProps = this._accessedPropsDuringWork.splice(0, this._accessedPropsDuringWork.length)
    const editedProps = this._editedPropsDuringWork.splice(0, this._editedPropsDuringWork.length)

    // A Work cannot be dependent of a property edited by itself
    const dependencies = accessedProps.filter(propPath => !this._propPathExistsIn(propPath, editedProps))

    if (this._verbose) {
      this._log('Accessed', accessedProps)
      this._log('Edited', editedProps)
      this._log('Dependencies (accessed without edited)', dependencies)
    }

    // Replace rependencies
    work.resetDependencies()
    dependencies.forEach(dependency => work.declareDependency(dependency))

    this._successiveStack.push(work)
  }

  private _getReversedWorksDependencies (): ReversedDependencies<CustomProps, CustomComputeds> {
    const dependencies = new ReversedDependencies<CustomProps, CustomComputeds>()
    this._works.forEach(work => {
      const workDependencies = work.getDependencies()
      workDependencies.forEach(dependency => {
        dependencies.add(dependency, work)
      })
    })
    return dependencies
  }

  private _checkLoopInStack (): boolean {
    const workList: Work<CustomProps, CustomComputeds, void>[] = []
    const workCount: Record<number, number> = { }
    this._successiveStack.forEach(work => {
      let index = workList.indexOf(work)
      if (!~index) {
        workList.push(work)
        index = workList.length - 1
        workCount[index] = 0
      }
      workCount[index]++
    })
    let maxCount = 0
    Object.keys(workCount).forEach(index => {
      if (workCount[parseInt(index)] > maxCount) maxCount = workCount[parseInt(index)]
    })
    return maxCount > 20
  }

  private _isObject (value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  private _getDeep (obj: Record<PropName, unknown>, keys: PropPath): unknown {
    if (keys.length == 1) return obj[keys[0]]
    else {
      const next = obj[keys[0]]
      if (this._isObject(next)) return this._getDeep(next, keys.slice(1))
    }
  }

  private _propPathExistsIn (needle: PropPath, haystack: PropPath[]): boolean {
    let exists = false
    for (let i = 0; i < haystack.length; i++) {
      const item = haystack[i]
      if (needle.length == item.length) {
        let arraysAreEqual = true
        for (let j = 0; j < needle.length; j++) {
          if (needle[j] !== item[j]) {
            arraysAreEqual = false
            break
          }
        }
        if (arraysAreEqual) {
          exists = true
          break
        }
      }
    }
    return exists
  }

  private _log (...args: unknown[]): void {
    const zeros = (n: number, length = 2) => {
      const nStr = n.toString()
      return '0'.repeat(Math.max(0, length - nStr.length)) + nStr
    }
    const now = new Date()
    const nowString = '[' +
      zeros(now.getHours()) +
      ':' +
      zeros(now.getMinutes()) +
      ':' +
      zeros(now.getSeconds()) +
      '.' +
      zeros(now.getMilliseconds(), 3) +
      ']'
    console.log.bind(this, nowString).apply(this, args)
  }
}
