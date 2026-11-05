import type { Animal } from '../data/animals'
import { animalName, t } from './i18n'
import { refreshIn } from './transition'

/**
 * おうえん（投げ銭）の前の「おとなの方へ」。生まれた年を聞いて 18 歳未満なら通さない。
 * 年は保存しない。通った先は「準備中」の案内だけ（決済はまだ無いので、払えるふりをしない）。
 */
export interface GuardianGate {
  open: (animal: Animal) => void
  close: () => void
  isOpen: () => boolean
  onClose: (fn: () => void) => void
  setReduceMotion: (on: boolean) => void
}

const ADULT_AGE = 18

export function createGuardianGate(): GuardianGate {
  const root = document.getElementById('book-gate') as HTMLElement
  const backBtn = document.getElementById('gate-back') as HTMLButtonElement
  const form = document.getElementById('gate-form') as HTMLFormElement
  const year = document.getElementById('gate-year') as HTMLInputElement
  const error = document.getElementById('gate-error') as HTMLElement
  const support = document.getElementById('gate-support') as HTMLElement
  const supportTitle = document.getElementById('gate-support-title') as HTMLElement

  let open = false
  let reduceMotion = false
  let animal: Animal | null = null
  const closeListeners: Array<() => void> = []

  const showError = (msg: string) => {
    error.textContent = msg
    error.hidden = false
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const v = year.value.trim()
    if (!/^\d{4}$/.test(v)) {
      showError(t('gateBad'))
      return
    }
    const age = new Date().getFullYear() - Number(v)
    if (age < ADULT_AGE || age > 120) {
      showError(age > 120 ? t('gateBad') : t('gateYoung'))
      return
    }
    year.value = ''
    error.hidden = true
    form.hidden = true
    supportTitle.textContent = animal ? t('supportTitle', { name: animalName(animal) }) : t('support')
    support.hidden = false
    if (!reduceMotion) refreshIn(support)
    backBtn.focus()
  })
  year.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation()
  })
  backBtn.addEventListener('click', () => {
    close()
  })

  const close = () => {
    if (!open) return
    open = false
    root.hidden = true
    year.value = ''
    animal = null
    closeListeners.forEach((fn) => fn())
  }

  return {
    open: (a) => {
      animal = a
      open = true
      error.hidden = true
      form.hidden = false
      support.hidden = true
      year.value = ''
      root.hidden = false
      if (!reduceMotion) refreshIn(root)
      year.focus()
    },
    close,
    isOpen: () => open,
    onClose: (fn) => {
      closeListeners.push(fn)
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
