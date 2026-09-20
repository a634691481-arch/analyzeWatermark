<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

const url = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

const contactOpen = useState('contact-dialog-open', () => false)
</script>

<template>
  <form
    class="mt-8 rounded-2xl bg-elevated p-3 ring ring-default sm:p-4"
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
        :ui="{ base: 'w-full' }"
      />
      <UButton
        type="submit"
        size="xl"
        color="primary"
        icon="i-lucide-sparkles"
        :loading="loading"
        :disabled="!url.trim()"
        label="解析"
        :ui="{ base: 'justify-center' }"
      />
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
  </form>
</template>
