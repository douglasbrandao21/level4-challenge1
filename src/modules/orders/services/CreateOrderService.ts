import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer)
      throw new AppError('Cliente não encontrado. Tente novamente.');

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentProducts.length)
      throw new AppError('Nenhum dos produtos informados existem.');

    const existentProductsIds = existentProducts.map(product => product.id);

    const someProductIsInvalid = products.filter(product => {
      return !existentProductsIds.includes(product.id);
    });

    if (someProductIsInvalid.length)
      throw new AppError(
        'Algum dos produtos enviados é invalido. Tente novamente.',
      );

    const someProductWithoutStock = products.filter(product => {
      return (
        existentProducts.filter(existentProduct => {
          return existentProduct.id === product.id;
        })[0].quantity < product.quantity
      );
    });

    if (someProductWithoutStock.length)
      throw new AppError('Algum dos produtos está fora de estoque');

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentProducts.filter(
        existentProduct => existentProduct.id === product.id,
      )[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(order_product => ({
      id: order_product.product_id,
      quantity:
        existentProducts.filter(
          existentProduct => existentProduct.id === order_product.product_id,
        )[0].quantity - order_product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
