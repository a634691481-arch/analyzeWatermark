<script setup lang="ts">
import type { ParsedMedia } from '#shared/types'

const props = defineProps<{
  media: ParsedMedia[]
  /** 当前预览的下标；null 表示关闭 */
  index: number | null
}>()

const emit = defineEmits<{
  (e: 'update:index', value: number | null): void
  (e: 'download', item: ParsedMedia): void
  (e: 'download-original', item: ParsedMedia): void
}>()

const open = computed({
  get: () => props.index !== null,
  set: (value: boolean) => {
    if (!value) emit('update:index', null)
  }
})

const current = computed<ParsedMedia | null>(() => {
  if (props.index === null) return null
  return props.media[props.index] ?? null
})

const hasPrev = computed(() => props.index !== null && props.index > 0)
const hasNext = computed(() => props.index !== null && props.index < props.media.length - 1)

function step(delta: number) {
  if (props.index === null) return
  const next = props.index + delta
  if (next < 0 || next >= props.media.length) return
  emit('update:index', next)
}

/** 方向键左右切换 */
function onKeydown(event: KeyboardEvent) {
  if (props.index === null) return
  if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <UModal
    v-model:open="open"
    :ui="{ content: 'max-w-6xl overflow-hidden', overlay: 'bg-black/70 backdrop-blur-sm' }"
  >
    <template #content>
      <div v-if="current" class="flex flex-col">
        <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              #{{ current.index }} · {{ current.filename }}
            </p>
            <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-dimmed">
              <span v-if="current.width && current.height">{{ current.width }} × {{ current.height }}</span>
              <span v-if="current.duration">{{ formatDuration(current.duration) }}</span>
              <UBadge
                :color="current.watermarkFree ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
                :label="current.watermarkFree ? '无水印' : '仅水印版'"
              />
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-download"
              :label="current.type === 'video' ? '下载视频' : '下载图片'"
              @click="emit('download', current)"
            />
            <UButton
              v-if="current.originalUrl"
              size="sm"
              color="primary"
              variant="ghost"
              icon="i-lucide-file-down"
              label="原图(HEIC)"
              @click="emit('download-original', current)"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              aria-label="关闭预览"
              @click="open = false"
            />
          </div>
        </div>

        <div class="relative flex max-h-[76vh] items-center justify-center bg-muted">
          <video
            v-if="current.type === 'video'"
            :key="current.id"
            :src="proxyUrl(current.url)"
            :poster="current.thumbnailUrl ? proxyUrl(current.thumbnailUrl) : undefined"
            class="max-h-[76vh] w-full bg-black object-contain"
            controls
            autoplay
            playsinline
          />
          <img
            v-else
            :key="current.id"
            :src="proxyUrl(current.url)"
            :alt="current.filename"
            class="max-h-[76vh] w-full object-contain"
          >

          <UButton
            v-if="hasPrev"
            class="absolute left-3 top-1/2 -translate-y-1/2"
            color="neutral"
            variant="solid"
            icon="i-lucide-chevron-left"
            aria-label="上一个"
            @click="step(-1)"
          />
          <UButton
            v-if="hasNext"
            class="absolute right-3 top-1/2 -translate-y-1/2"
            color="neutral"
            variant="solid"
            icon="i-lucide-chevron-right"
            aria-label="下一个"
            @click="step(1)"
          />
        </div>

        <div class="flex items-center gap-3 border-t border-default px-4 py-2.5 text-xs text-dimmed">
          <span class="shrink-0 tabular-nums">{{ (index ?? 0) + 1 }} / {{ media.length }}</span>
          <span v-if="media.length > 1" class="hidden shrink-0 sm:inline">← → 切换</span>
          <span v-if="current.prompt" class="truncate" :title="current.prompt">{{ current.prompt }}</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
