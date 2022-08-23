declare type IfEquals<T, U, Y = unknown, N = never> = (<G>() => G extends T ? 1 : 2) extends (<G>() => G extends U ? 1 : 2) ? Y : N;
declare type PropValue = unknown;
declare type PropName = string | number | symbol;
interface Props {
    [key: PropName]: PropValue;
}
declare type ComputedName = string | number | symbol;
declare type ComputedValue = unknown;
interface Computeds {
    [key: ComputedName]: ComputedValue;
}
declare type PropPath = PropName[];
declare type WorkHandler<CustomProps extends Props, CustomComputeds extends Computeds, Return> = (prop: CustomProps, computed: CustomComputeds, invalidatedProps?: PropPath[]) => Return;
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
export declare class Reactive<CustomProps extends Props = Props, CustomComputeds extends Computeds = Computeds> {
    prop: CustomProps;
    computed: CustomComputeds;
    private _props;
    private _computeds;
    private _works;
    private _tickRunning;
    private _successiveStack;
    private _editedPropsDuringTick;
    private _editedPropsDuringWork;
    private _accessedPropsDuringWork;
    private _eventListeners;
    private _verbose;
    private _linkedPropInvalidations;
    constructor(props?: Partial<CustomProps>, computeds?: Partial<{
        [key in keyof CustomComputeds]: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[key]>;
    }>, verbose?: boolean);
    /**
     * Define a new Prop.
     *
     * This Prop will be constantly observed. When this Prop is mutated, the
     * value of any Computed dependent of this Prop will be updated, and any
     * dependent Work will be re-run.
     *
     * This can be done one time per Prop only.
     */
    defineProp<T extends keyof CustomProps>(propName: T, value: CustomProps[T]): void;
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
    defineProps(props: Partial<CustomProps>): void;
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
    defineWork(handler: WorkHandler<CustomProps, CustomComputeds, void>): void;
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
    defineWorks(handlers: WorkHandler<CustomProps, CustomComputeds, void>[]): void;
    /**
     * Define a new Computed.
     *
     * A Computed is defined with a function that makes use of Props and other
     * Computeds to create a new dynamic value.
     *
     * In the same manner as Works, the Computeds values are updated once the
     * related Props are mutated.
     */
    defineComputed<T extends keyof CustomComputeds>(computedName: T, handler: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[T]>): void;
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
    defineComputeds(handlers: Partial<{
        [key in keyof CustomComputeds]: WorkHandler<CustomProps, CustomComputeds, CustomComputeds[key]>;
    }>): void;
    /**
     * Links a Prop from another Reactive object to the current one.
     *
     * This Prop won't be mutable, but it can be accessed and will trigger
     * dependent Works.
     */
    defineSharedProp<SourceProps extends Props, SourceComputeds extends Computeds, U extends IfEquals<CustomProps[keyof CustomProps], SourceProps[keyof SourceProps], CustomProps[keyof CustomProps], never>>(sourceReactive: Reactive<SourceProps, SourceComputeds>, targetPropName: keyof CustomProps, sourcePropName: keyof SourceProps): void;
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
    defineSharedProps<SourceProps extends Props, SourceComputeds extends Computeds>(sourceReactive: Reactive<SourceProps, SourceComputeds>, map: Partial<Record<keyof SourceProps, keyof CustomProps>>): void;
    /**
     * Links a Select or an Input Element to an existing Prop.
     *
     * Editing the Prop will change the Element value.
     *
     * When the Element value changes, the Prop value will also be changed.
     */
    defineFormProp(propName: keyof CustomProps, element: HTMLInputElement | HTMLSelectElement, accessors?: {
        setter?: (element: HTMLInputElement | HTMLSelectElement, value: PropValue) => void;
        getter?: (element: HTMLInputElement | HTMLSelectElement) => PropValue;
    }): void;
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
    defineFormProps(formLinks: {
        [key in keyof Partial<CustomProps>]: {
            element: HTMLInputElement | HTMLSelectElement;
            accessors?: {
                setter?: (element: HTMLInputElement | HTMLSelectElement, value: PropValue) => void;
                getter?: (element: HTMLInputElement | HTMLSelectElement) => PropValue;
            };
        };
    }): void;
    /**
     * Will mark a Prop as edited, without having to actually edit the Prop.
     */
    touch(propPath: PropName | PropPath): void;
    /**
     * Will clean the references of the object to prevent memory leaks.
     */
    destroy(): void;
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
    private _createObjectProxy;
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
    private _propEdited;
    /**
     * When a Work is accessing a prop, it will be marked as dependent of it.
     *
     * If a Work is accessing `path.to.a`, it will be dependent of:
     * - `path`
     * - `path.to`
     * - `path.to.a`
     */
    private _propAccessed;
    /**
     * Declare that, when a Prop is invalidated, it should also invalidate
     * another Prop from another Reactive.
     */
    private _linkPropInvalidation;
    /**
     * Runs a full Tick that will run all Works that are invalidated.
     */
    private _dispatchWorks;
    /**
     * Dispatch the Work and find its dependencies
     * @param invalidatedProps When called from a tick, all props invalidated
     *  during this tick are forwarded
     */
    private _dispatchWork;
    private _getReversedWorksDependencies;
    private _checkLoopInStack;
    private _isObject;
    private _getDeep;
    private _propPathExistsIn;
    private _log;
}
export {};
