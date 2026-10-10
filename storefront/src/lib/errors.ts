export interface ErrorDetail { field: string; message: string }

/** Lỗi từ API theo khung chuẩn { success:false, error:{ code, message, details } }. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: ErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
  }
  /** Thông báo theo từng trường để gắn vào form. */
  fieldMessage(field: string): string | undefined {
    return this.details.find((d) => d.field.toLowerCase() === field.toLowerCase())?.message
  }
}

export function errorMessage(e: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  return e instanceof ApiError ? e.message : fallback
}
