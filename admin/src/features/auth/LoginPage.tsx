import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { useLabels, useSiteConfig } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, FormField, Input } from '@/components/ui/primitives'
import { useState } from 'react'

const schema = z.object({
  email: z.string().min(1, 'Nhập email').email('Email không hợp lệ'),
  password: z.string().min(1, 'Nhập mật khẩu'),
})
type Values = z.infer<typeof schema>

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const labels = useLabels()
  const { data: site } = useSiteConfig()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) })

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Không đăng nhập được. Vui lòng thử lại.')
    }
  })

  const logo = site?.media?.['general.logo']?.url
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
          {logo ? <img src={logo} alt={labels.siteName} className="mx-auto mb-2 block h-10 object-contain" /> : <p className="mb-1 text-lg font-bold">{labels.siteName}</p>}
          <h1 className="text-base font-semibold">Đăng nhập quản trị</h1>
        </div>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField label="Email" htmlFor="email" error={errors.email?.message} required>
            <Input id="email" type="email" autoComplete="username" autoFocus invalid={!!errors.email} {...register('email')} />
          </FormField>
          <FormField label="Mật khẩu" htmlFor="password" error={errors.password?.message} required>
            <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
          </FormField>
          {formError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-danger">{formError}</p>}
          <Button type="submit" loading={isSubmitting} className="w-full">Đăng nhập</Button>
        </form>
      </Card>
    </div>
  )
}
