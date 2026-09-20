<script setup lang="ts">
import type { ParsedMedia } from '#shared/types'

const props = defineProps<{
  item: ParsedMedia
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'preview', item: ParsedMedia): void
  (e: 'download', item: ParsedMedia): void
  (e: 'download-original', item: ParsedMedia): void
  (e: 'copy', item: ParsedMedia): void
}>()

const loaded = ref(false)

const isVideo = computed(() => props.item.type === 'video')
const src = computed(() => proxyUrl(props.item.url))
/** 缩略图：小尺寸版本，先出画面再等原图/视频就绪 */
const posterSrc = computed(() => (props.item.thumbnailUrl ? proxyUrl(props.item.thumbnailUrl) : ''))

const sizeText = computed(() => {
  const { width, height } = props.item
  return width && height ? `${width} × ${height}` : ''
})

const durationText = computed(() => (isVideo.value ? formatDuration(props.item.duration) : ''))
</script>

<template>
  <div
    class="group flex flex-col overflow-hidden rounded-xl bg-elevated ring transition"
    :class="selected ? 'ring-2 ring-primary' : 'ring-default hover:ring-primary/40'"
  >
    <div class="relative aspect-square overflow-hidden bg-muted">
      <!-- 占位小图：先出画面，避免大文件白屏 -->
      <img
        v-if="posterSrc && !loaded"
        :src="posterSrc"
        class="absolute inset-0 h-full w-full scale-105 object-cover blur-lg"
        alt=""
        aria-hidden="true"
      >

      <video
        v-if="isVideo"
        :src="src"
        :poster="posterSrc"
        class="relative h-full w-full object-contain transition-opacity duration-300"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        controls
        playsinline
        preload="metadata"
        :aria-label="`第 ${item.index} 个视频`"
        @loadeddata="loaded = true"
      />
      <img
        v-else
        :src="src"
        loading="lazy"
        decoding="async"
        class="relative h-full w-full object-contain transition-opacity duration-300"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        :alt="`第 ${item.index} 张图片`"
        @load="loaded = true"
      >

      <div class="absolute left-2 top-2 z-20 rounded-md bg-default/85 p-1 backdrop-blur-sm">
        <UCheckbox
          :model-value="selected"
          :aria-label="`选择第 ${item.index} 个`"
          @update:model-value="emit('toggle', item.id)"
        />
      </div>

      <!-- 图片：整个画面可点开预览 -->
      <button
        v-if="!isVideo"
        type="button"
        class="absolute inset-0 z-10 cursor-zoom-in"
        :aria-label="`放大预览第 ${item.index} 张图片`"
        @click="emit('preview', item)"
      >
        <span
          class="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/10"
        >
          <UIcon
            name="i-lucide-zoom-in"
            class="size-8 text-white opacity-0 transition group-hover:opacity-90"
          />
        </span>
      </button>

      <div class="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1">
        <UBadge v-if="isVideo" color="neutral" variant="solid" size="sm" icon="i-lucide-video" :label="durationText || '视频'" />
        <UBadge
          :color="item.watermarkFree ? 'success' : 'warning'"
          variant="solid"
          size="sm"
          :label="item.watermarkFree ? '无水印' : '仅水印版'"
        />
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-2 p-3">
      <div class="flex items-center justify-between gap-2 text-xs text-muted">
        <span class="font-medium text-highlighted">#{{ item.index }}</span>
        <span v-if="sizeText">{{ sizeText }}</span>
      </div>

      <p
        v-if="item.prompt"
        class="line-clamp-2 text-xs leading-relaxed text-dimmed"
        :title="item.prompt"
      >
        {{ item.prompt }}
      </p>

      <div class="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-download"
          :label="isVideo ? '下载视频' : '下载图片'"
          @click="emit('download', item)"
        />
        <UButton
          v-if="isVideo"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-zoom-in"
          label="放大"
          @click="emit('preview', item)"
        />
        <UButton
          v-if="item.originalUrl"
          size="xs"
          color="primary"
          variant="ghost"
          icon="i-lucide-file-down"
          label="原图(HEIC)"
          @click="emit('download-original', item)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-link"
          label="复制链接"
          @click="emit('copy', item)"
        />
      </div>
    </div>
  </div>
</template>
