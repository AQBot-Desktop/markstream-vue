import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { useSafeI18n as useVue2SafeI18n } from '../packages/markstream-vue2/src/composables/useSafeI18n'
import { useSafeI18n } from '../src/composables/useSafeI18n'

const TestComponent = defineComponent({
  setup() {
    const { t } = useSafeI18n()
    return { t }
  },
  template: '<span>{{ t("common.copy") }}</span>',
})

const originalVueI18nUse = (globalThis as any).$vueI18nUse

afterEach(() => {
  vi.restoreAllMocks()

  if (originalVueI18nUse === undefined)
    delete (globalThis as any).$vueI18nUse
  else
    (globalThis as any).$vueI18nUse = originalVueI18nUse
})

describe('useSafeI18n', () => {
  it('prefers the current app translator without mutating globalThis', () => {
    delete (globalThis as any).$vueI18nUse
    const appT = vi.fn((key: string) => key === 'common.copy' ? 'Kopieren' : key)

    const wrapper = mount(TestComponent, {
      global: {
        config: {
          globalProperties: {
            $t: appT,
          },
        },
      },
    })

    expect(wrapper.text()).toBe('Kopieren')
    expect(appT).toHaveBeenCalledWith('common.copy')
    expect((globalThis as any).$vueI18nUse).toBeUndefined()
  })

  it('uses the built-in fallback without triggering vue-i18n missing-key warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({
      legacy: false,
      globalInjection: true,
      locale: 'zh',
      fallbackLocale: 'en',
      messages: {
        zh: {},
        en: {},
      },
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [i18n],
      },
    })

    expect(wrapper.text()).toBe('Copy')
    expect(warn).not.toHaveBeenCalled()
  })

  it('still supports an explicitly provided global vue-i18n hook', () => {
    const globalHook = vi.fn(() => ({
      t: (key: string) => key === 'common.copy' ? 'Global Copy' : key,
    }))
    ;(globalThis as any).$vueI18nUse = globalHook

    const wrapper = mount(TestComponent)

    expect(wrapper.text()).toBe('Global Copy')
    expect(globalHook).toHaveBeenCalledTimes(1)
    expect((globalThis as any).$vueI18nUse).toBe(globalHook)
  })
})

describe('markstream-vue2 useSafeI18n', () => {
  it('uses the built-in fallback without triggering hooked vue-i18n missing-key warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const i18n = createI18n({
      legacy: false,
      globalInjection: true,
      locale: 'zh',
      fallbackLocale: 'en',
      messages: {
        zh: {},
        en: {},
      },
    })
    ;(globalThis as any).$vueI18nUse = () => i18n.global

    const { t } = useVue2SafeI18n()

    expect(t('common.copy')).toBe('Copy')
    expect(warn).not.toHaveBeenCalled()
  })

  it('still supports hooked translations', () => {
    ;(globalThis as any).$vueI18nUse = () => ({
      t: (key: string) => key === 'common.copy' ? 'Copier' : key,
      te: (key: string) => key === 'common.copy',
    })

    const { t } = useVue2SafeI18n()

    expect(t('common.copy')).toBe('Copier')
  })
})
