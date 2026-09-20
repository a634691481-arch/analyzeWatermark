<script setup lang="ts">
import type { ParsedImage } from '#shared/types'

const props = defineProps<{
  image: ParsedImage
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'download', image: ParsedImage): void
  (e: 'copy', image: ParsedImage): void
}>()

/** 是否切换到"带水印版本"，用于直观对比去水印效果 */
const showWatermark = ref(false)
const rawLoaded = ref(false)

const rawSrc = computed(() => proxyUrl(props.image.url))
const watermarkSrc = computed(() => (props.image.watermarkUrl ? proxyUrl(props.image.watermarkUrl) : ''))

const currentSrc = computed(() => {
  if (showWatermark.value && watermarkSrc.value) return watermarkSrc.value
  return rawSrc.value
})

const sizeText = computed(() => {
  const { width, height } = props.image
  return width && height ? `${width} × ${height}` : ''
})
</script>

<template>
  <div
    class="group flex flex-col overflow-hidden rounded-xl bg-elevated ring transition"
    :class="selected ? 'ring-2 ring-primary' : 'ring-default hover:ring-primary/40'"
  >
    <div class="relative aspect-square overflow-hidden bg-muted">
      <img
        v-if="watermarkSrc && !showWatermark && !rawLoaded"
        :src="watermarkSrc"
        class="absolute inset-0 h-full w-full scale-105 object-cover blur-lg"
        alt=""
        aria-hidden="true"
      >
      <img
        :src="currentSrc"
        loading="lazy"
        decoding="async"
        class="relative h-full w-full object-contain transition-opacity duration-300"
        :class="showWatermark || rawLoaded ? 'opacity-100' : 'opacity-0'"
        :alt="`第 ${image.index} 张图片`"
        @load="rawLoaded = true"
      >

      <div class="absolute left-2 top-2 rounded-md bg-default/85 p-1 backdrop-blur-sm">
        <UCheckbox
          :model-value="selected"
          :aria-label="`选择第 ${image.index} 张`"
          @update:model-value="emit('toggle', image.id)"
        />
      </div>

      <UBadge
        class="absolute right-2 top-2"
        :color="image.watermarkFree ? 'success' : 'warning'"
        variant="solid"
        size="sm"
        :label="image.watermarkFree ? '无水印' : '仅水印版'"
      />
    </div>

    <div class="flex flex-1 flex-col gap-2 p-3">
      <div class="flex items-center justify-between gap-2 text-xs text-muted">
        <span class="font-medium text-highlighted">#{{ image.index }}</span>
        <span v-if="sizeText">{{ sizeText }}</span>
      </div>

      <p
        v-if="image.prompt"
        class="line-clamp-2 text-xs leading-relaxed text-dimmed"
        :title="image.prompt"
      >
        {{ image.prompt }}
      </p>

      <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-download"
          label="下载原图"
          @click="emit('download', image)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-link"
          label="复制链接"
          @click="emit('copy', image)"
        />
        <UButton
          v-if="watermarkSrc"
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="showWatermark ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :label="showWatermark ? '看原图' : '看水印版'"
          @click="showWatermark = !showWatermark"
        />
      </div>
    </div>
  </div>
</template>
