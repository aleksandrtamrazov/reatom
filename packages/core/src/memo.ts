import {
  AC,
  ActionPayload,
  Atom,
  Cache,
  Effect,
  Fn,
  invalid,
  isActionCreator,
  isAtom,
  isFunction,
  Rec,
  Transaction,
} from './internal'

export type Computer<State = any, Ctx extends Rec = Rec> = {
  ($: Track<State, Ctx>, state: State): State
}

export type Track<State, Ctx extends Rec> = {
  <T>(atom: Atom<T>): T
  <T>(atom: Atom<T>, cb: Fn<[T], Effect<Ctx>>): void
  <T>(atom: Atom<T>, cb: Fn<[T], any>): void
  <T extends AC>(
    actionCreator: T,
    cb: Fn<[ActionPayload<T>, ReturnType<T>], Effect<Ctx>>,
  ): void
  <T extends AC>(
    actionCreator: T,
    cb: Fn<[ActionPayload<T>, ReturnType<T>], any>,
  ): void
}

export function memo<State, Ctx extends Rec = Rec>(
  transaction: Transaction,
  cache: Cache<State>,
  computer: Computer<State, Ctx>,
): Cache<State> {
  const { deps } = cache
  let patchDeps: Cache<State>['deps'] = []
  let patchState: State
  let patchTypes: Cache<State>['types'] = new Set()
  let isDepsCacheChange = false
  let isDepsOrderChange = false
  let isDepsTypesChange = false
  let nesting = 0

  function calcResult() {
    if (isDepsTypesChange) {
      patchDeps.forEach((dep) =>
        isActionCreator(dep)
          ? patchTypes.add(dep.type)
          : dep.cache.types.forEach((type) => patchTypes.add(type)),
      )
    } else {
      patchTypes = cache.types
    }

    return isDepsCacheChange ||
      !Object.is(cache.state, patchState) ||
      deps.length === 0
      ? {
          deps: patchDeps,
          ctx: cache.ctx,
          state: patchState,
          types: patchTypes,
        }
      : cache
  }

  function clearPatch() {
    patchDeps.length = 0
    patchTypes.clear()
  }

  const shouldSkipComputer =
    deps.length > 0 &&
    deps.every((dep) => {
      if (isActionCreator(dep)) {
        const { type } = dep
        if (transaction.actions.some((action) => action.type === type)) {
          clearPatch()
          return false
        }
      } else {
        const { atom: depAtom, cache: depCache } = dep
        const depPatch = transaction.process(depAtom, depCache)

        if (depPatch !== depCache) {
          if (depPatch.state !== depCache.state) {
            clearPatch()
            return false
          }

          dep = { atom: depAtom, cache: depPatch }

          isDepsCacheChange = true

          isDepsTypesChange ||= depPatch.types !== depCache.types
        }
      }

      patchDeps.push(dep)

      return true
    })

  if (shouldSkipComputer) {
    patchState = cache.state

    return calcResult()
  }

  function scheduleEffect(effect: any) {
    if (isFunction(effect)) {
      transaction.effects.push((store) => effect(store, cache.ctx))
    }
  }

  function trackAtom(depAtom: Atom, cb?: Fn) {
    const depPatch = transaction.process(depAtom)

    if (nesting === 1) {
      const dep: any =
        deps.length > patchDeps.length ? deps[patchDeps.length] : null

      isDepsOrderChange ||= dep?.atom !== depAtom

      isDepsCacheChange ||= isDepsOrderChange || dep.cache !== depPatch

      isDepsTypesChange ||=
        isDepsOrderChange || dep.cache.types !== depPatch.types

      patchDeps.push({ atom: depAtom, cache: depPatch })

      if (
        cb &&
        (isDepsOrderChange || !Object.is(dep.cache.state, depPatch.state))
      ) {
        scheduleEffect(cb(depPatch.state))
      }
    } else {
      if (/* TODO: `process.env.NODE_ENV === 'development'` */ true) {
        invalid(cb, `callback in nested track`)
      }
    }

    return depPatch.state
  }

  let track: Track<State, Ctx> = (atomOrAction: Atom | AC, cb?: Fn) => {
    if (/* TODO: `process.env.NODE_ENV === 'development'` */ true) {
      // TODO: how to pass the `id` of atom here?
      invalid(Number.isNaN(nesting), `outdated track call`)
    }

    nesting++

    try {
      if (isAtom(atomOrAction)) return trackAtom(atomOrAction, cb)

      if (/* TODO: `process.env.NODE_ENV === 'development'` */ true) {
        invalid(!isActionCreator(atomOrAction), `track arguments`)
      }

      if (nesting === 1) {
        if (/* TODO: `process.env.NODE_ENV === 'development'` */ true) {
          invalid(!cb, `action track without callback`)
        }

        isDepsOrderChange ||=
          deps.length <= patchDeps.length ||
          deps[patchDeps.length] !== atomOrAction

        isDepsTypesChange ||= isDepsOrderChange

        patchDeps.push(atomOrAction)

        transaction.actions.forEach((action) => {
          if (action.type === atomOrAction.type) {
            scheduleEffect(cb!(action.payload, action))
          }
        })
      } else {
        if (/* TODO: `process.env.NODE_ENV === 'development'` */ true) {
          invalid(true, `action handling in nested track`)
        }
      }
    } finally {
      nesting--
    }
  }

  patchState = computer(track, cache.state)

  nesting = NaN

  isDepsOrderChange = isDepsOrderChange || deps.length > patchDeps.length
  isDepsCacheChange = isDepsCacheChange || isDepsOrderChange
  isDepsTypesChange = isDepsTypesChange || isDepsOrderChange

  return calcResult()
}