import type { ImageMetadata } from 'astro';
import comingSoonImage from '../assets/good-apollo-coming-soon.png';

export const shopCategories = [
  { id: 'all', label: 'All hats', href: '/shop/' },
  { id: 'adult', label: 'Adult', href: '/shop/adult/' },
  { id: 'child', label: 'Child', href: '/shop/child/' },
] as const;

export type Audience = Exclude<(typeof shopCategories)[number]['id'], 'all'>;
export type ProductStatus = 'Coming Soon' | 'Available' | 'Sold Out';

export interface ProductImage {
  src: ImageMetadata;
  alt: string;
  position?: string;
  placeholder?: boolean;
}

export interface Product {
  slug: string;
  name: string;
  audience: Audience;
  price?: number;
  color: string;
  materials: string[];
  lining: string;
  sizes: string[];
  status: ProductStatus;
  description: string;
  detail: string;
  images: ProductImage[];
}

const placeholder = (name: string): ProductImage => ({
  src: comingSoonImage,
  alt: `${name} photography coming soon`,
  placeholder: true,
});

/** Initial hat collection. Replace placeholders as finished photography arrives. */
export const products: Product[] = [
  {
    slug: 'deep-burgundy-corduroy-hat',
    name: 'Deep burgundy corduroy hat',
    audience: 'adult',
    color: 'Deep burgundy',
    materials: ['Cotton corduroy', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'Coming Soon',
    description: 'A softly structured everyday hat in deep burgundy corduroy, finished with a comfortable cotton lining.',
    detail: 'Cut and sewn one at a time in the Good Apollo studio. Small variations are part of the character of a handmade piece.',
    images: [placeholder('Deep burgundy corduroy hat')],
  },
  {
    slug: 'cornflower-cotton-twill-hat',
    name: 'Cornflower cotton twill hat',
    audience: 'adult',
    color: 'Cornflower blue',
    materials: ['Cotton twill', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['S', 'M', 'L', 'XL'],
    status: 'Coming Soon',
    description: 'A clean, versatile shape in sturdy cornflower cotton twill with an easy cotton-lined interior.',
    detail: 'Made in a small batch with close attention to the brim, seams, and the way the hat settles into shape with wear.',
    images: [placeholder('Cornflower cotton twill hat')],
  },
  {
    slug: 'dusty-lilac-corduroy-hat',
    name: 'Dusty lilac corduroy hat',
    audience: 'child',
    color: 'Dusty lilac',
    materials: ['Cotton corduroy', 'Cotton'],
    lining: 'Fully lined in soft cotton',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    status: 'Coming Soon',
    description: 'A comfortable child-sized hat in soft dusty lilac corduroy, made for everyday wear and lined in breathable cotton.',
    detail: 'Each hat is cut and sewn by one maker in Grand Rapids. Choose size by actual head circumference for the best fit.',
    images: [placeholder('Dusty lilac corduroy hat')],
  },
  {
    slug: 'buttercream-cotton-hat',
    name: 'Buttercream cotton hat',
    audience: 'child',
    color: 'Buttercream',
    materials: ['Cotton', 'Cotton twill'],
    lining: 'Fully lined in soft cotton',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    status: 'Coming Soon',
    description: 'A light, softly structured hat in buttercream cotton with a practical twill outer and a smooth cotton lining.',
    detail: 'Made in a limited run in the Good Apollo studio, with durable seams and a simple shape that works season after season.',
    images: [placeholder('Buttercream cotton hat')],
  },
];

export const formatPrice = (price: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(price);
