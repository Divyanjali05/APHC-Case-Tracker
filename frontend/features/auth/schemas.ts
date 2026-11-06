import { z } from 'zod';

export const loginSchema = z.object({
  enrollmentNumber: z
    .string()
    .min(1, 'Enrollment number is required')
    .regex(/^[A-Za-z]{2}\/\d{1,6}\/\d{4}$/, 'Format must be AP/1234/2020'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  enrollmentNumber: z
    .string()
    .min(1, 'Enrollment number is required')
    .regex(/^[A-Za-z]{2}\/\d{1,6}\/\d{4}$/, 'Format must be AP/1234/2020'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
