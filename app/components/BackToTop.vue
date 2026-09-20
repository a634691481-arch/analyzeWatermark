<script setup lang="ts">
/** 滚动超过阈值才出现，点击平滑回到顶部 */
const THRESHOLD = 320

const visible = ref(false)

function syncVisibility() {
  visible.value = window.scrollY > THRESHOLD
}

function toTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  syncVisibility()
  window.addEventListener('scroll', syncVisibility, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', syncVisibility)
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <UButton
      v-if="visible"
      icon="i-lucide-arrow-up"
      aria-label="回到顶部"
      color="primary"
      size="lg"
      class="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
      @click="toTop"
    />
  </Transition>
</template>
