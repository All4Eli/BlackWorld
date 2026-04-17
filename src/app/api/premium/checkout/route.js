import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', { apiVersion: '2023-10-16' });

export async function POST(request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { amount, costStr, itemName, action } = await request.json();

        // 1. If user doesn't have a Stripe Secret, mock it instantly (development safety fallback)
        if (!process.env.STRIPE_SECRET_KEY) {
            console.warn("No STRIPE_SECRET_KEY provided. Using mock payment flow.");
            // You can optionally write the items directly here or redirect to a success page.
            // For now, we mock success for local testing.
            return NextResponse.json({ 
                success: true, 
                mock: true, 
                redirectUrl: `/?checkout=success&amount=${amount}&item=${encodeURIComponent(itemName || 'Currency')}` 
            });
        }

        // 2. Real Stripe Checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: itemName || `${amount} Blood Stones`,
                            description: 'BlackWorld Premium Currency',
                        },
                        // Parse '$9.99' to 999 cents
                        unit_amount: action === 'BUY_CURRENCY' ? parseInt(costStr.replace('$', '').replace('.', '')) : 0, 
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?checkout=success`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?checkout=cancelled`,
            metadata: {
                userId,
                amount,
                action
            }
        });

        return NextResponse.json({ redirectUrl: session.url });
    } catch(err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
