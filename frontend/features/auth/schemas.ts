import { z } from 'zod';

const enrollmentRegex = /^[A-Za-z]{2}\/\d{1,6}\/\d{4}$/;

export const loginSchema = z.object({
  enrollmentNumber: z
    .string()
    .min(1, 'Enrollment number is required')
    .regex(enrollmentRegex, 'Format must be AP/1234/2020'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    enrollmentNumber: z
      .string()
      .min(1, 'Enrollment number is required')
      .regex(enrollmentRegex, 'Format must be AP/1234/2020'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    firstName: z.string().optional().default(''),
    lastName: z.string().optional().default(''),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  enrollmentNumber: z
    .string()
    .min(1, 'Enrollment number is required')
    .regex(enrollmentRegex, 'Format must be AP/1234/2020'),
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
