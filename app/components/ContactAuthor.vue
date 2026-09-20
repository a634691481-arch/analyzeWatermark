<script setup lang="ts">
import type { ContactResponse } from '#shared/types'

/** 跨组件共享开关：ParseForm 里的「联系作者适配」也能把弹框叫起来 */
const open = useState('contact-dialog-open', () => false)

const toast = useToast()

const contact = ref('')
const content = ref('')
const submitting = ref(false)

const canSubmit = computed(
  () => contact.value.trim().length > 0 && content.value.trim().length > 0
)

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true

  try {
    const response = await $fetch<ContactResponse>('/api/contact', {
      method: 'POST',
      body: { contact: contact.value, content: content.value }
    })

    if (response.ok) {
      contact.value = ''
      content.value = ''
      open.value = false
      toast.add({
        title: '已收到，感谢反馈',
        description: '作者看到后会尽快安排适配',
        color: 'success',
        icon: 'i-lucide-check'
      })
      return
    }

    toast.add({
      title: '提交失败',
      description: response.error.message,
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  }
  catch (error) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    toast.add({
      title: '提交失败',
      description: message || '网络异常，请稍后重试',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="联系作者适配"
    description="没有找到想用的平台？留下联系电话和需求，作者会尽快安排适配。"
  >
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <UFormField label="联系电话 / 联系方式" required>
          <UInput
            v-model="contact"
            class="w-full"
            icon="i-lucide-phone"
            placeholder="手机号 / 微信号 / 邮箱"
            :disabled="submitting"
          />
        </UFormField>

        <UFormField label="想适配的平台 / 需求" required>
          <UTextarea
            v-model="content"
            class="w-full"
            :rows="4"
            placeholder="例如：想支持视频号、TikTok，或某个具体链接解析失败"
            :disabled="submitting"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="取消"
          :disabled="submitting"
          @click="open = false"
        />
        <UButton
          color="primary"
          icon="i-lucide-send"
          label="提交给作者"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
