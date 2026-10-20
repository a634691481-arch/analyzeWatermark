<script setup lang="ts">
import ShimmerButton from '~/components/inspira/ShimmerButton.vue'

const props = defineProps<{
  modelValue: string
  loading?: boolean
  /** 有可清空的内容时，在输入框尾部显示清空图标 */
  clearable?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'clear'): void
  (e: 'paste'): void
}>()

const url = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

const contactOpen = useState('contact-dialog-open', () => false)

/** 清空确认弹窗：输入框与结果一起清掉，误触代价不小 */
const confirmOpen = ref(false)

const canClear = computed(() => props.clearable && !props.loading)

function confirmClear() {
  confirmOpen.value = false
  emit('clear')
}
</script>

<template>
  <form
    class="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_0_60px_-20px_rgba(16,185,129,0.45)] backdrop-blur-xl sm:p-4"
    @submit.prevent="emit('submit')"
  >
    <div class="flex flex-col gap-3 sm:flex-row">
      <UInput
        v-model="url"
        class="flex-1"
        size="xl"
        icon="i-lucide-link"
        placeholder="粘贴分享链接或整段分享文案"
        :disabled="loading"
        :ui="{ base: 'w-full bg-white/[0.03] ring-white/10' }"
      >
        <template v-if="!loading" #trailing>
          <div class="flex items-center gap-0.5">
            <!-- 显式粘贴：用户手势触发，iOS Safari 也只认这种 -->
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-clipboard-paste"
              aria-label="从剪贴板粘贴"
              title="粘贴剪贴板内容"
              class="rounded-full"
              @click="emit('paste')"
            />
            <UButton
              v-if="canClear"
              type="button"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              aria-label="清空输入与解析结果"
              title="清空"
              class="rounded-full"
              @click="confirmOpen = true"
            />
          </div>
        </template>
      </UInput>
      <ShimmerButton
        type="submit"
        :disabled="!url.trim() || loading"
        background="rgba(16, 185, 129, 0.20)"
        shimmer-color="#5eead4"
        :shimmer-duration="'2.4s'"
        border-radius="12px"
        class="h-12 w-full gap-2 px-6 text-sm font-medium sm:w-auto"
      >
        <UIcon
          :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-sparkles'"
          class="size-4"
          :class="loading && 'animate-spin'"
        />
        <span>{{ loading ? '解析中' : '解析' }}</span>
      </ShimmerButton>
    </div>

    <div class="mt-3 px-1 text-xs">
      <button
        type="button"
        class="inline-flex items-center gap-1 text-primary hover:underline"
        @click="contactOpen = true"
      >
        没找到想用的平台？联系作者适配
        <UIcon name="i-lucide-message-square-plus" class="size-3.5" />
      </button>
    </div>

    <UModal
      v-model:open="confirmOpen"
      title="清空当前内容？"
      description="输入框、解析结果和已选中的文件都会被清除，此操作无法撤销。"
    >
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" label="取消" @click="close" />
          <UButton
            type="button"
            color="error"
            icon="i-lucide-trash-2"
            label="确认清空"
            @click="confirmClear"
          />
        </div>
      </template>
    </UModal>
  </form>
</template>
