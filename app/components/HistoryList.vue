<script setup lang="ts">
import type { HistoryEntry } from '~/composables/useParseHistory'

const props = defineProps<{
  entries: HistoryEntry[]
  /** 当前正在展示的链接，用于高亮 */
  activeId?: string
  refreshing?: boolean
}>()

const emit = defineEmits<{
  (e: 'restore', entry: HistoryEntry): void
  (e: 'refresh', entry: HistoryEntry): void
  (e: 'remove', id: string): void
  (e: 'clear'): void
}>()

const expanded = ref(false)
const visible = computed(() => (expanded.value ? props.entries : props.entries.slice(0, 3)))
</script>

<template>
  <section v-if="entries.length" class="mt-6">
    <div class="flex items-center justify-between gap-3 px-1">
      <h2 class="flex items-center gap-2 text-sm font-medium text-highlighted">
        <UIcon name="i-lucide-history" class="size-4 text-dimmed" />
        历史记录
        <UBadge :label="String(entries.length)" color="neutral" variant="subtle" size="sm" />
      </h2>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        label="清空"
        @click="emit('clear')"
      />
    </div>

    <ul class="mt-3 space-y-2">
      <li
        v-for="entry in visible"
        :key="entry.id"
        class="group flex cursor-pointer items-center gap-3 rounded-xl bg-elevated p-3 ring transition"
        :class="entry.id === activeId ? 'ring-2 ring-primary' : 'ring-default hover:ring-primary/40'"
        @click="emit('restore', entry)"
      >
        <UBadge :label="entry.platform.name" color="primary" variant="subtle" size="sm" class="shrink-0" />

        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ entry.title || shortenUrl(entry.sourceUrl) }}
          </p>
          <p class="mt-0.5 truncate text-xs text-dimmed">
            {{ entry.imageCount }} 张 · 无水印 {{ entry.watermarkFreeCount }} 张
            <template v-if="entry.author"> · {{ entry.author }}</template>
            · {{ formatRelativeTime(entry.parsedAt) }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-1" @click.stop>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            label="重新解析"
            :loading="refreshing && entry.id === activeId"
            @click="emit('refresh', entry)"
          />
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-x"
            aria-label="删除该记录"
            @click="emit('remove', entry.id)"
          />
        </div>
      </li>
    </ul>

    <div v-if="entries.length > 3" class="mt-3 text-center">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="expanded ? '收起' : `展开全部 ${entries.length} 条`"
        @click="expanded = !expanded"
      />
    </div>
  </section>
</template>
