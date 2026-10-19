import { z } from 'zod';

export const loginSchema = z.object({
  enrollmentNumber: z
    .string()
    .min(1, 'Enrollment number is required')
    .regex(/^[A-Za-z]{2}\/\d{1,6}\/\d{4}$/, 'Format must be AP/1234/2020'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
