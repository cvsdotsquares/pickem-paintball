import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover'
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10
    });

    const history = invoices.data.map(invoice => ({
      id: invoice.id,
      amount: invoice.amount_paid,
      date: new Date(invoice.created * 1000).toISOString(),
      status: invoice.status,
      invoiceUrl: invoice.hosted_invoice_url
    }));

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error('Error fetching billing history:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch billing history'
    }, { status: 500 });
  }
}
